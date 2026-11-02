import { Router } from "express";
import { asyncHandler, validateBody } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { productionEntrySchema } from "../validators.js";
import {
  createProductionEntry,
  listProductionEntries,
} from "../services/production.service.js";

const router = Router();

// Log a shift production entry from the shop floor. Operators and managers.
router.post(
  "/",
  requireAuth,
  requireRole("manager", "operator"),
  validateBody(productionEntrySchema),
  asyncHandler(async (req, res) => {
    const row = await createProductionEntry(req.body, req.user);
    res.status(201).json(row);
  })
);

// List production entries for the dashboard. Managers and operators.
router.get(
  "/",
  requireAuth,
  requireRole("manager", "operator"),
  asyncHandler(async (req, res) => {
    const rows = await listProductionEntries({
      productId: req.query.productId,
      processId: req.query.processId,
    });
    res.json(rows);
  })
);

export default router;
