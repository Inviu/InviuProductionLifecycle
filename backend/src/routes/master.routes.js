import { Router } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../config/db.js";
import {
  productsTable,
  processesTable,
  machinesTable,
  machineProcessMappingTable,
  productProcessMappingTable,
  productProcessInventoryTable,
  ordersTable,
} from "../db/schema.js";
import { asyncHandler, validateBody, AppError } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  productSchema,
  processSchema,
  machineSchema,
  productChainSchema,
  inventorySetSchema,
  inventoryAdjustSchema,
} from "../validators.js";

const router = Router();
const manager = [requireAuth, requireRole("manager")];

// ---------- Products ----------
router.get(
  "/products",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await db.select().from(productsTable).orderBy(asc(productsTable.id)));
  })
);

router.post(
  "/products",
  ...manager,
  validateBody(productSchema),
  asyncHandler(async (req, res) => {
    const [row] = await db
      .insert(productsTable)
      .values({ name: req.body.name, description: req.body.description })
      .returning();
    res.status(201).json(row);
  })
);

router.put(
  "/products/:id",
  ...manager,
  validateBody(productSchema),
  asyncHandler(async (req, res) => {
    const [row] = await db
      .update(productsTable)
      .set({ name: req.body.name, description: req.body.description })
      .where(eq(productsTable.id, Number(req.params.id)))
      .returning();
    if (!row) throw new AppError("Product not found", 404);
    res.json(row);
  })
);

router.delete(
  "/products/:id",
  ...manager,
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.id);
    // Guard against deleting a product that work orders still reference.
    const [used] = await db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(eq(ordersTable.productId, productId))
      .limit(1);
    if (used) {
      throw new AppError("Cannot delete a product that has work orders", 409);
    }
    const [row] = await db
      .delete(productsTable)
      .where(eq(productsTable.id, productId))
      .returning();
    if (!row) throw new AppError("Product not found", 404);
    res.json(row);
  })
);

// Processes of a product, in sequence.
router.get(
  "/products/:id/processes",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await db
      .select({
        id: processesTable.id,
        name: processesTable.name,
        sequence: productProcessMappingTable.sequence,
      })
      .from(productProcessMappingTable)
      .innerJoin(processesTable, eq(processesTable.id, productProcessMappingTable.processId))
      .where(eq(productProcessMappingTable.productId, Number(req.params.id)))
      .orderBy(asc(productProcessMappingTable.sequence), asc(productProcessMappingTable.id));
    res.json(rows);
  })
);

// Replace a product's whole process chain.
router.put(
  "/products/:id/processes",
  ...manager,
  validateBody(productChainSchema),
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.id);
    // Validate every referenced process exists before touching the chain.
    const requestedIds = [...new Set(req.body.processes.map((p) => p.processId))];
    const found = await db
      .select({ id: processesTable.id })
      .from(processesTable)
      .where(inArray(processesTable.id, requestedIds));
    if (found.length !== requestedIds.length) {
      throw new AppError("One or more processes do not exist", 400);
    }
    await db.transaction(async (tx) => {
      await tx
        .delete(productProcessMappingTable)
        .where(eq(productProcessMappingTable.productId, productId));
      for (const p of req.body.processes) {
        await tx.insert(productProcessMappingTable).values({
          productId,
          processId: p.processId,
          sequence: p.sequence,
        });
        // Ensure an inventory row exists for each product/process pair.
        const [inv] = await tx
          .select()
          .from(productProcessInventoryTable)
          .where(
            and(
              eq(productProcessInventoryTable.productId, productId),
              eq(productProcessInventoryTable.processId, p.processId)
            )
          );
        if (!inv) {
          await tx
            .insert(productProcessInventoryTable)
            .values({ productId, processId: p.processId, availableQuantity: 0 });
        }
      }
    });
    res.json({ message: "Process chain updated" });
  })
);

// ---------- Processes ----------
router.get(
  "/processes",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await db.select().from(processesTable).orderBy(asc(processesTable.id)));
  })
);

router.post(
  "/processes",
  ...manager,
  validateBody(processSchema),
  asyncHandler(async (req, res) => {
    const [row] = await db
      .insert(processesTable)
      .values({ name: req.body.name, standardRatePerHour: req.body.standardRatePerHour ?? null })
      .returning();
    res.status(201).json(row);
  })
);

router.put(
  "/processes/:id",
  ...manager,
  validateBody(processSchema),
  asyncHandler(async (req, res) => {
    const patch = { name: req.body.name };
    if (req.body.standardRatePerHour !== undefined) {
      patch.standardRatePerHour = req.body.standardRatePerHour;
    }
    const [row] = await db
      .update(processesTable)
      .set(patch)
      .where(eq(processesTable.id, Number(req.params.id)))
      .returning();
    if (!row) throw new AppError("Process not found", 404);
    res.json(row);
  })
);

router.delete(
  "/processes/:id",
  ...manager,
  asyncHandler(async (req, res) => {
    const [row] = await db
      .delete(processesTable)
      .where(eq(processesTable.id, Number(req.params.id)))
      .returning();
    if (!row) throw new AppError("Process not found", 404);
    res.json(row);
  })
);

// ---------- Machines ----------
// GET /machines            -> all machines
// GET /machines?processId= -> machines mapped to a process
router.get(
  "/machines",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { processId } = req.query;
    if (processId) {
      const rows = await db
        .select({ id: machinesTable.id, name: machinesTable.name })
        .from(machineProcessMappingTable)
        .innerJoin(machinesTable, eq(machinesTable.id, machineProcessMappingTable.machineId))
        .where(eq(machineProcessMappingTable.processId, Number(processId)))
        .orderBy(asc(machinesTable.id));
      return res.json(rows);
    }
    res.json(await db.select().from(machinesTable).orderBy(asc(machinesTable.id)));
  })
);

router.post(
  "/machines",
  ...manager,
  validateBody(machineSchema),
  asyncHandler(async (req, res) => {
    const row = await db.transaction(async (tx) => {
      const [machine] = await tx
        .insert(machinesTable)
        .values({ name: req.body.name })
        .returning();
      for (const processId of req.body.processIds || []) {
        await tx.insert(machineProcessMappingTable).values({ machineId: machine.id, processId });
      }
      return machine;
    });
    res.status(201).json(row);
  })
);

router.put(
  "/machines/:id",
  ...manager,
  validateBody(machineSchema),
  asyncHandler(async (req, res) => {
    const machineId = Number(req.params.id);
    const row = await db.transaction(async (tx) => {
      const [machine] = await tx
        .update(machinesTable)
        .set({ name: req.body.name })
        .where(eq(machinesTable.id, machineId))
        .returning();
      if (!machine) throw new AppError("Machine not found", 404);
      if (req.body.processIds) {
        await tx
          .delete(machineProcessMappingTable)
          .where(eq(machineProcessMappingTable.machineId, machineId));
        for (const processId of req.body.processIds) {
          await tx.insert(machineProcessMappingTable).values({ machineId, processId });
        }
      }
      return machine;
    });
    res.json(row);
  })
);

router.delete(
  "/machines/:id",
  ...manager,
  asyncHandler(async (req, res) => {
    const [row] = await db
      .delete(machinesTable)
      .where(eq(machinesTable.id, Number(req.params.id)))
      .returning();
    if (!row) throw new AppError("Machine not found", 404);
    res.json(row);
  })
);

// ---------- Inventory ----------
router.get(
  "/inventory/product/:productId/process/:processId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [inv] = await db
      .select({ availableQuantity: productProcessInventoryTable.availableQuantity })
      .from(productProcessInventoryTable)
      .where(
        and(
          eq(productProcessInventoryTable.productId, Number(req.params.productId)),
          eq(productProcessInventoryTable.processId, Number(req.params.processId))
        )
      );
    res.json({ availableQuantity: inv?.availableQuantity ?? 0 });
  })
);

router.put(
  "/inventory/product/:productId/process/:processId",
  ...manager,
  validateBody(inventorySetSchema),
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.productId);
    const processId = Number(req.params.processId);
    const [existing] = await db
      .select()
      .from(productProcessInventoryTable)
      .where(
        and(
          eq(productProcessInventoryTable.productId, productId),
          eq(productProcessInventoryTable.processId, processId)
        )
      );
    if (existing) {
      const [row] = await db
        .update(productProcessInventoryTable)
        .set({ availableQuantity: req.body.availableQuantity, updatedAt: new Date() })
        .where(eq(productProcessInventoryTable.id, existing.id))
        .returning();
      return res.json(row);
    }
    const [row] = await db
      .insert(productProcessInventoryTable)
      .values({ productId, processId, availableQuantity: req.body.availableQuantity })
      .returning();
    res.status(201).json(row);
  })
);

router.post(
  "/inventory/product/:productId/process/:processId/adjust",
  ...manager,
  validateBody(inventoryAdjustSchema),
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.productId);
    const processId = Number(req.params.processId);
    const row = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(productProcessInventoryTable)
        .where(
          and(
            eq(productProcessInventoryTable.productId, productId),
            eq(productProcessInventoryTable.processId, processId)
          )
        )
        .for("update");
      const current = existing?.availableQuantity ?? 0;
      const next = current + req.body.delta;
      if (next < 0) throw new AppError("Adjustment would make inventory negative", 400);
      if (existing) {
        const [r] = await tx
          .update(productProcessInventoryTable)
          .set({ availableQuantity: next, updatedAt: new Date() })
          .where(eq(productProcessInventoryTable.id, existing.id))
          .returning();
        return r;
      }
      const [r] = await tx
        .insert(productProcessInventoryTable)
        .values({ productId, processId, availableQuantity: next })
        .returning();
      return r;
    });
    res.json(row);
  })
);

export default router;
