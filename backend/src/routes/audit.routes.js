import { Router } from "express";
import { asyncHandler } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listAudit } from "../services/audit.service.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    res.json(await listAudit({ limit }));
  })
);

export default router;
