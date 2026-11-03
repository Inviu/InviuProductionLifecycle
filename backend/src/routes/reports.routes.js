import { Router } from "express";
import { asyncHandler } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getSummary, getEfficiency } from "../services/reports.service.js";

const router = Router();

router.get(
  "/summary",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    res.json(await getSummary());
  })
);

// Shift-efficiency analytics from production entries.
router.get(
  "/efficiency",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    res.json(await getEfficiency({ from: req.query.from, to: req.query.to }));
  })
);

export default router;
