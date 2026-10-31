import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db } from "../config/db.js";
import {
  ordersTable,
  orderProcessesTable,
  orderProcessMachineTable,
  productsTable,
  processesTable,
  machinesTable,
  productProcessInventoryTable,
} from "../db/schema.js";

/**
 * The shop-floor queue: every order process that is actionable right now —
 * unlocked (Ready or Assigned), with units still to complete. Includes the
 * context an operator needs: order, customer, product, machines, and the
 * inventory available to draw from.
 */
export async function getOperatorQueue({ machineId } = {}) {
  const rows = await db
    .select({
      orderProcessId: orderProcessesTable.id,
      orderId: ordersTable.id,
      customerName: ordersTable.customerName,
      productId: ordersTable.productId,
      productName: productsTable.name,
      processId: orderProcessesTable.processId,
      processName: processesTable.name,
      sequence: orderProcessesTable.sequence,
      availableQuantity: orderProcessesTable.availableQuantity,
      completedQuantity: orderProcessesTable.completedQuantity,
      status: orderProcessesTable.status,
      dueDate: ordersTable.dueDate,
    })
    .from(orderProcessesTable)
    .innerJoin(ordersTable, eq(ordersTable.id, orderProcessesTable.orderId))
    .innerJoin(productsTable, eq(productsTable.id, ordersTable.productId))
    .innerJoin(processesTable, eq(processesTable.id, orderProcessesTable.processId))
    .where(
      and(
        sql`${orderProcessesTable.status} in ('Ready','Assigned')`,
        gt(orderProcessesTable.availableQuantity, 0),
        sql`${orderProcessesTable.completedQuantity} < ${orderProcessesTable.availableQuantity}`
      )
    )
    .orderBy(asc(ordersTable.dueDate), asc(ordersTable.id), asc(orderProcessesTable.sequence));

  // Attach machine assignments and inventory per row.
  const result = [];
  for (const r of rows) {
    const machines = await db
      .select({
        machineId: machinesTable.id,
        machineName: machinesTable.name,
        assignedQuantity: orderProcessMachineTable.assignedQuantity,
      })
      .from(orderProcessMachineTable)
      .innerJoin(machinesTable, eq(machinesTable.id, orderProcessMachineTable.machineId))
      .where(eq(orderProcessMachineTable.orderProcessId, r.orderProcessId));

    if (machineId && !machines.some((m) => m.machineId === Number(machineId))) continue;

    const [inv] = await db
      .select({ availableQuantity: productProcessInventoryTable.availableQuantity })
      .from(productProcessInventoryTable)
      .where(
        and(
          eq(productProcessInventoryTable.productId, r.productId),
          eq(productProcessInventoryTable.processId, r.processId)
        )
      );

    result.push({
      ...r,
      remaining: r.availableQuantity - r.completedQuantity,
      inventoryAvailable: inv?.availableQuantity ?? 0,
      machines,
    });
  }
  return result;
}
