import { Router } from "express";
import { asyncHandler } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getOperatorQueue } from "../services/operator.service.js";

const router = Router();

// Shop-floor queue of actionable work. Operators and managers.
router.get(
  "/queue",
  requireAuth,
  requireRole("manager", "operator"),
  asyncHandler(async (req, res) => {
    res.json(await getOperatorQueue({ machineId: req.query.machineId }));
  })
);

export default router;
