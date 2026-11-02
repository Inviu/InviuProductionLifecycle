import { Router } from "express";
import { asyncHandler, validateBody } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  createWorkOrderSchema,
  updateWorkOrderSchema,
  assignSchema,
  completeSchema,
} from "../validators.js";
import {
  createWorkOrder,
  updateWorkOrderHeader,
  assignMachines,
  completeProcess,
  deleteWorkOrder,
  listWorkOrders,
  getWorkOrderDetail,
} from "../services/workOrder.service.js";

const router = Router();
const manager = [requireAuth, requireRole("manager")];
// Operators and managers may record completions.
const floor = [requireAuth, requireRole("manager", "operator")];

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => res.json(await listWorkOrders()))
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => res.json(await getWorkOrderDetail(Number(req.params.id))))
);

router.post(
  "/",
  ...manager,
  validateBody(createWorkOrderSchema),
  asyncHandler(async (req, res) => {
    const order = await createWorkOrder(req.body, req.user);
    res.status(201).json(await getWorkOrderDetail(order.id));
  })
);

router.put(
  "/:id",
  ...manager,
  validateBody(updateWorkOrderSchema),
  asyncHandler(async (req, res) => {
    await updateWorkOrderHeader(Number(req.params.id), req.body, req.user);
    res.json(await getWorkOrderDetail(Number(req.params.id)));
  })
);

router.delete(
  "/:id",
  ...manager,
  asyncHandler(async (req, res) => {
    await deleteWorkOrder(Number(req.params.id), req.user);
    res.json({ message: "Work order deleted" });
  })
);

router.post(
  "/:id/processes/:processId/assign",
  ...manager,
  validateBody(assignSchema),
  asyncHandler(async (req, res) => {
    const detail = await assignMachines(
      Number(req.params.id),
      Number(req.params.processId),
      req.body.machines,
      req.user
    );
    res.json(detail);
  })
);

router.post(
  "/:id/processes/:processId/complete",
  ...floor,
  validateBody(completeSchema),
  asyncHandler(async (req, res) => {
    const detail = await completeProcess(
      Number(req.params.id),
      Number(req.params.processId),
      req.body.quantity,
      req.user,
      { machineId: req.body.machineId ?? null, productionIssueReason: req.body.productionIssueReason ?? null }
    );
    res.json(detail);
  })
);

export default router;
