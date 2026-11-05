// Manager screen for machines: which machine numbers belong to which process
// step, plus each machine's name. Machines with production history can be
// renamed or moved between steps but not deleted, so no logs are lost.
import { Router } from "express";
import { z } from "zod";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../config/db.js";
import {
  machinesTable,
  machineProcessMappingTable,
  processesTable,
  productionEntryTable,
  orderProcessMachineTable,
} from "../db/schema.js";
import { asyncHandler, validateBody, AppError } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { recordAudit } from "../services/audit.service.js";

const router = Router();
const manager = [requireAuth, requireRole("manager")];

const machineBody = z.object({
  name: z.string().trim().min(1, "Enter a machine number").max(40),
  description: z.union([z.string().trim().max(255), z.null()]).optional(),
  processIds: z.array(z.coerce.number().int().positive()).optional(),
});

async function overview() {
  const steps = await db
    .select({ id: processesTable.id, name: processesTable.name, formType: processesTable.formType })
    .from(processesTable)
    .orderBy(asc(processesTable.id));
  const machines = await db
    .select({ id: machinesTable.id, name: machinesTable.name, description: machinesTable.description })
    .from(machinesTable)
    .orderBy(asc(machinesTable.id));
  const links = await db.select().from(machineProcessMappingTable);
  const logs = await db
    .select({ machineId: productionEntryTable.machineId, n: sql`count(*)::int` })
    .from(productionEntryTable)
    .groupBy(productionEntryTable.machineId);
  const assigned = await db
    .select({ machineId: orderProcessMachineTable.machineId, n: sql`count(*)::int` })
    .from(orderProcessMachineTable)
    .groupBy(orderProcessMachineTable.machineId);
  const logN = new Map(logs.map((r) => [r.machineId, r.n]));
  const asgN = new Map(assigned.map((r) => [r.machineId, r.n]));
  return {
    steps: steps.map((s) => ({ ...s, machineIds: links.filter((l) => l.processId === s.id).map((l) => l.machineId) })),
    machines: machines
      .map((m) => ({
        ...m,
        processIds: links.filter((l) => l.machineId === m.id).map((l) => l.processId),
        logs: logN.get(m.id) || 0,
        assignments: asgN.get(m.id) || 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
  };
}

async function assertUniqueName(name, exceptId) {
  const [dup] = await db
    .select({ id: machinesTable.id })
    .from(machinesTable)
    .where(
      and(
        sql`lower(${machinesTable.name}) = lower(${name})`,
        exceptId ? ne(machinesTable.id, exceptId) : undefined
      )
    );
  if (dup) throw new AppError(`Machine number ${name} already exists`, 409);
}

async function assertSteps(ids) {
  if (!ids?.length) return;
  const found = await db.select({ id: processesTable.id }).from(processesTable).where(inArray(processesTable.id, ids));
  if (found.length !== new Set(ids).size) throw new AppError("One or more steps do not exist", 400);
}

router.get("/", ...manager, asyncHandler(async (req, res) => res.json(await overview())));

router.post(
  "/machines",
  ...manager,
  validateBody(machineBody),
  asyncHandler(async (req, res) => {
    const { name, description, processIds = [] } = req.body;
    await assertUniqueName(name);
    await assertSteps(processIds);
    const machine = await db.transaction(async (tx) => {
      const [m] = await tx
        .insert(machinesTable)
        .values({ name, description: description || null })
        .returning();
      for (const processId of new Set(processIds)) {
        await tx.insert(machineProcessMappingTable).values({ machineId: m.id, processId });
      }
      await recordAudit(tx, { userId: req.user?.id, action: "machine.create", entity: "machine", entityId: m.id, details: { name, description, processIds } });
      return m;
    });
    res.status(201).json(machine);
  })
);

router.put(
  "/machines/:id",
  ...manager,
  validateBody(machineBody),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { name, description, processIds } = req.body;
    await assertUniqueName(name, id);
    await assertSteps(processIds);
    const machine = await db.transaction(async (tx) => {
      const [m] = await tx
        .update(machinesTable)
        .set({ name, description: description || null })
        .where(eq(machinesTable.id, id))
        .returning();
      if (!m) throw new AppError("Machine not found", 404);
      if (processIds) {
        await tx.delete(machineProcessMappingTable).where(eq(machineProcessMappingTable.machineId, id));
        for (const processId of new Set(processIds)) {
          await tx.insert(machineProcessMappingTable).values({ machineId: id, processId });
        }
      }
      await recordAudit(tx, { userId: req.user?.id, action: "machine.update", entity: "machine", entityId: id, details: { name, description, processIds } });
      return m;
    });
    res.json(machine);
  })
);

router.delete(
  "/machines/:id",
  ...manager,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [[{ n: logs }], [{ n: asg }]] = await Promise.all([
      db.select({ n: sql`count(*)::int` }).from(productionEntryTable).where(eq(productionEntryTable.machineId, id)),
      db.select({ n: sql`count(*)::int` }).from(orderProcessMachineTable).where(eq(orderProcessMachineTable.machineId, id)),
    ]);
    if (logs || asg) {
      throw new AppError(
        `This machine has ${logs} production log${logs === 1 ? "" : "s"}${asg ? ` and ${asg} work-order assignment${asg === 1 ? "" : "s"}` : ""}, so it can't be deleted without losing history. Remove it from its steps instead.`,
        409
      );
    }
    const [m] = await db.delete(machinesTable).where(eq(machinesTable.id, id)).returning();
    if (!m) throw new AppError("Machine not found", 404);
    await recordAudit(db, { userId: req.user?.id, action: "machine.delete", entity: "machine", entityId: id, details: { name: m.name } });
    res.json(m);
  })
);

export default router;
