import { Router } from "express";
import { asyncHandler } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getSummary } from "../services/reports.service.js";

const router = Router();

router.get(
  "/summary",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    res.json(await getSummary());
  })
);

export default router;
