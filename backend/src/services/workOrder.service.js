import { and, eq, inArray } from "drizzle-orm";
import { db } from "../config/db.js";
import {
  ordersTable,
  orderProcessesTable,
  orderProcessMachineTable,
  productProcessMappingTable,
  productProcessInventoryTable,
  processesTable,
  machinesTable,
  machineProcessMappingTable,
  productsTable,
} from "../db/schema.js";
import { AppError } from "../middleware/validate.js";
import { recordAudit } from "./audit.service.js";

// Process status lifecycle (server-owned): Locked -> Ready -> Assigned -> Completed
const STATUS = {
  LOCKED: "Locked",
  READY: "Ready",
  ASSIGNED: "Assigned",
  COMPLETED: "Completed",
};

// Order status: Pending -> In Progress -> Completed
const ORDER_STATUS = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
};

/**
 * Create a work order. The server derives the process chain from the product's
 * process mapping (ordered by sequence); the client cannot dictate it.
 */
export async function createWorkOrder({ customerName, productId, quantity, dueDate }, user) {
  return db.transaction(async (tx) => {
    const [product] = await tx
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, productId));
    if (!product) throw new AppError("Product not found", 404);

    const mappings = await tx
      .select({
        processId: productProcessMappingTable.processId,
        sequence: productProcessMappingTable.sequence,
      })
      .from(productProcessMappingTable)
      .where(eq(productProcessMappingTable.productId, productId))
      .orderBy(productProcessMappingTable.sequence, productProcessMappingTable.id);

    if (mappings.length === 0) {
      throw new AppError("Product has no process chain configured", 400);
    }

    const [order] = await tx
      .insert(ordersTable)
      .values({
        customerName,
        productId,
        quantity,
        dueDate: dueDate ? new Date(dueDate) : null,
        status: ORDER_STATUS.PENDING,
      })
      .returning();

    let seq = 1;
    for (const m of mappings) {
      const isFirst = seq === 1;
      await tx.insert(orderProcessesTable).values({
        orderId: order.id,
        processId: m.processId,
        sequence: seq,
        availableQuantity: isFirst ? quantity : 0,
        completedQuantity: 0,
        status: isFirst ? STATUS.READY : STATUS.LOCKED,
      });
      seq += 1;
    }

    await recordAudit(tx, {
      userId: user?.id,
      action: "work_order.create",
      entity: "order",
      entityId: order.id,
      details: { customerName, productId, quantity },
    });

    return order;
  });
}

/** Update editable header fields only (customer, due date). Quantity/product are immutable. */
export async function updateWorkOrderHeader(orderId, { customerName, dueDate }, user) {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) throw new AppError("Order not found", 404);

  const patch = {};
  if (customerName !== undefined) patch.customerName = customerName;
  if (dueDate !== undefined) patch.dueDate = dueDate ? new Date(dueDate) : null;
  if (Object.keys(patch).length === 0) return order;

  const [updated] = await db
    .update(ordersTable)
    .set(patch)
    .where(eq(ordersTable.id, orderId))
    .returning();

  await recordAudit(db, {
    userId: user?.id,
    action: "work_order.update",
    entity: "order",
    entityId: orderId,
    details: patch,
  });
  return updated;
}

/** Replace machine assignments for a process. Total assigned may not exceed availableQuantity. */
export async function assignMachines(orderId, processId, machines, user) {
  return db.transaction(async (tx) => {
    const op = await loadOrderProcess(tx, orderId, processId, { forUpdate: true });
    if (op.status === STATUS.LOCKED) {
      throw new AppError("Process is locked; the previous process must complete first", 409);
    }
    if (op.status === STATUS.COMPLETED) {
      throw new AppError("Process is already completed", 409);
    }

    const total = machines.reduce((s, m) => s + m.assignedQuantity, 0);
    if (total > op.availableQuantity) {
      throw new AppError(
        `Assigned total (${total}) exceeds available quantity (${op.availableQuantity})`,
        400
      );
    }

    // Validate all referenced machines are mapped to THIS process.
    const machineIds = [...new Set(machines.map((m) => m.machineId))];
    if (machineIds.length) {
      const valid = await tx
        .select({ machineId: machineProcessMappingTable.machineId })
        .from(machineProcessMappingTable)
        .where(
          and(
            eq(machineProcessMappingTable.processId, processId),
            inArray(machineProcessMappingTable.machineId, machineIds)
          )
        );
      if (valid.length !== machineIds.length) {
        throw new AppError("One or more machines are not valid for this process", 400);
      }
    }

    await tx
      .delete(orderProcessMachineTable)
      .where(eq(orderProcessMachineTable.orderProcessId, op.id));

    for (const m of machines) {
      await tx.insert(orderProcessMachineTable).values({
        orderProcessId: op.id,
        machineId: m.machineId,
        assignedQuantity: m.assignedQuantity,
      });
    }

    // Reflect assignment in status unless already completed.
    const newStatus = machines.length > 0 ? STATUS.ASSIGNED : op.status;
    await tx
      .update(orderProcessesTable)
      .set({ status: newStatus })
      .where(eq(orderProcessesTable.id, op.id));

    await recordAudit(tx, {
      userId: user?.id,
      action: "work_order.assign",
      entity: "order_process",
      entityId: op.id,
      details: { orderId, processId, machines },
    });

    await recomputeOrderStatus(tx, orderId);
    return getWorkOrderDetail(orderId, tx);
  });
}

/**
 * Complete `quantity` units of a process, consuming product/process inventory.
 * Cascades completed units to the next process and recomputes order status.
 * All within a transaction with row locks to be fail-safe under concurrency.
 */
export async function completeProcess(orderId, processId, quantity, user) {
  if (quantity <= 0) throw new AppError("Quantity must be positive", 400);

  return db.transaction(async (tx) => {
    const op = await loadOrderProcess(tx, orderId, processId, { forUpdate: true });
    if (op.status === STATUS.LOCKED) {
      throw new AppError("Process is locked; the previous process must complete first", 409);
    }

    const remaining = op.availableQuantity - op.completedQuantity;
    if (quantity > remaining) {
      throw new AppError(
        `Cannot complete ${quantity}; only ${remaining} unit(s) remain for this process`,
        400
      );
    }

    const [order] = await tx
      .select({ productId: ordersTable.productId })
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId));

    // Lock inventory row and verify stock.
    const [inv] = await tx
      .select()
      .from(productProcessInventoryTable)
      .where(
        and(
          eq(productProcessInventoryTable.productId, order.productId),
          eq(productProcessInventoryTable.processId, processId)
        )
      )
      .for("update");

    if (!inv || inv.availableQuantity < quantity) {
      throw new AppError(
        `Insufficient inventory for this process (have ${inv?.availableQuantity ?? 0}, need ${quantity})`,
        400
      );
    }

    await tx
      .update(productProcessInventoryTable)
      .set({
        availableQuantity: inv.availableQuantity - quantity,
        updatedAt: new Date(),
      })
      .where(eq(productProcessInventoryTable.id, inv.id));

    const newCompleted = op.completedQuantity + quantity;
    const fullyDone = op.availableQuantity > 0 && newCompleted >= op.availableQuantity;
    await tx
      .update(orderProcessesTable)
      .set({
        completedQuantity: newCompleted,
        status: fullyDone ? STATUS.COMPLETED : op.status === STATUS.LOCKED ? STATUS.READY : op.status,
      })
      .where(eq(orderProcessesTable.id, op.id));

    // Cascade to the next process in sequence.
    const [next] = await tx
      .select()
      .from(orderProcessesTable)
      .where(
        and(
          eq(orderProcessesTable.orderId, orderId),
          eq(orderProcessesTable.sequence, op.sequence + 1)
        )
      )
      .for("update");

    if (next) {
      const unlock = newCompleted > 0 && next.status === STATUS.LOCKED;
      await tx
        .update(orderProcessesTable)
        .set({
          availableQuantity: newCompleted,
          status: unlock ? STATUS.READY : next.status,
        })
        .where(eq(orderProcessesTable.id, next.id));
    }

    await recordAudit(tx, {
      userId: user?.id,
      action: "work_order.complete",
      entity: "order_process",
      entityId: op.id,
      details: { orderId, processId, quantity, completedQuantity: newCompleted },
    });

    await recomputeOrderStatus(tx, orderId);
    return getWorkOrderDetail(orderId, tx);
  });
}

export async function deleteWorkOrder(orderId, user) {
  const [deleted] = await db
    .delete(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .returning();
  if (!deleted) throw new AppError("Order not found", 404);
  await recordAudit(db, {
    userId: user?.id,
    action: "work_order.delete",
    entity: "order",
    entityId: orderId,
  });
  return deleted;
}

export async function listWorkOrders() {
  return db
    .select({
      id: ordersTable.id,
      customerName: ordersTable.customerName,
      productId: ordersTable.productId,
      productType: productsTable.name,
      quantity: ordersTable.quantity,
      status: ordersTable.status,
      createdDate: ordersTable.createdDate,
      dueDate: ordersTable.dueDate,
    })
    .from(ordersTable)
    .innerJoin(productsTable, eq(productsTable.id, ordersTable.productId))
    .orderBy(ordersTable.id);
}

export async function getWorkOrderDetail(orderId, conn = db) {
  const [order] = await conn
    .select({
      id: ordersTable.id,
      customerName: ordersTable.customerName,
      productId: ordersTable.productId,
      productType: productsTable.name,
      quantity: ordersTable.quantity,
      status: ordersTable.status,
      createdDate: ordersTable.createdDate,
      dueDate: ordersTable.dueDate,
    })
    .from(ordersTable)
    .innerJoin(productsTable, eq(productsTable.id, ordersTable.productId))
    .where(eq(ordersTable.id, orderId));

  if (!order) throw new AppError("Order not found", 404);

  const processes = await conn
    .select({
      id: orderProcessesTable.id,
      processId: orderProcessesTable.processId,
      processName: processesTable.name,
      availableQuantity: orderProcessesTable.availableQuantity,
      completedQuantity: orderProcessesTable.completedQuantity,
      status: orderProcessesTable.status,
      sequence: orderProcessesTable.sequence,
    })
    .from(orderProcessesTable)
    .innerJoin(processesTable, eq(processesTable.id, orderProcessesTable.processId))
    .where(eq(orderProcessesTable.orderId, orderId))
    .orderBy(orderProcessesTable.sequence);

  const opIds = processes.map((p) => p.id);
  const machines = opIds.length
    ? await conn
        .select({
          orderProcessId: orderProcessMachineTable.orderProcessId,
          machineId: machinesTable.id,
          machineName: machinesTable.name,
          assignedQuantity: orderProcessMachineTable.assignedQuantity,
        })
        .from(orderProcessMachineTable)
        .innerJoin(machinesTable, eq(machinesTable.id, orderProcessMachineTable.machineId))
        .where(inArray(orderProcessMachineTable.orderProcessId, opIds))
    : [];

  return {
    ...order,
    processes: processes.map((p) => ({
      id: p.id,
      processId: p.processId,
      processName: p.processName,
      availableQuantity: p.availableQuantity,
      completedQuantity: p.completedQuantity,
      status: p.status,
      sequence: p.sequence,
      machines: machines
        .filter((m) => m.orderProcessId === p.id)
        .map((m) => ({
          machineId: m.machineId,
          machineName: m.machineName,
          assignedQuantity: m.assignedQuantity,
        })),
    })),
  };
}

// ---- internal helpers ----

async function loadOrderProcess(tx, orderId, processId, { forUpdate = false } = {}) {
  let q = tx
    .select()
    .from(orderProcessesTable)
    .where(
      and(
        eq(orderProcessesTable.orderId, orderId),
        eq(orderProcessesTable.processId, processId)
      )
    );
  if (forUpdate) q = q.for("update");
  const [op] = await q;
  if (!op) throw new AppError("Process not found on this order", 404);
  return op;
}

async function recomputeOrderStatus(tx, orderId) {
  const rows = await tx
    .select({
      status: orderProcessesTable.status,
      completedQuantity: orderProcessesTable.completedQuantity,
    })
    .from(orderProcessesTable)
    .where(eq(orderProcessesTable.orderId, orderId));

  const allCompleted = rows.length > 0 && rows.every((r) => r.status === STATUS.COMPLETED);
  const anyProgress = rows.some(
    (r) => r.completedQuantity > 0 || r.status === STATUS.ASSIGNED || r.status === STATUS.COMPLETED
  );

  const status = allCompleted
    ? ORDER_STATUS.COMPLETED
    : anyProgress
    ? ORDER_STATUS.IN_PROGRESS
    : ORDER_STATUS.PENDING;

  await tx.update(ordersTable).set({ status }).where(eq(ordersTable.id, orderId));
}

export { STATUS, ORDER_STATUS };
