import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { asyncHandler, validateBody } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  getOverview,
  recordFeedback,
  resetLearning,
  getSettings,
  saveSettings,
  RULES,
} from "../services/analytics.service.js";
import { ask, agentEnabled } from "../services/agent.service.js";

const router = Router();
const manager = [requireAuth, requireRole("manager")];

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const query = (q) => ({
  from: day.safeParse(q.from).success ? q.from : undefined,
  to: day.safeParse(q.to).success ? q.to : undefined,
  family: typeof q.family === "string" && q.family ? q.family : undefined,
});

// Everything the efficiency-agent page shows.
router.get(
  "/overview",
  ...manager,
  asyncHandler(async (req, res) => {
    res.json({ ...(await getOverview(query(req.query))), askEnabled: agentEnabled() });
  })
);

const feedbackSchema = z.object({
  rule: z.enum(Object.keys(RULES)),
  scope: z.string().min(1).max(120),
  title: z.string().min(1).max(500),
  action: z.enum(["done", "rejected"]),
  metric: z
    .object({
      kind: z.string().max(40),
      key: z.string().max(120),
      label: z.string().max(120),
      value: z.union([z.number(), z.null()]).optional(),
    })
    .nullable()
    .optional(),
});

router.post(
  "/feedback",
  ...manager,
  validateBody(feedbackSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await recordFeedback(req.body, req.user));
  })
);

router.delete(
  "/learning",
  ...manager,
  asyncHandler(async (req, res) => {
    await resetLearning();
    res.json({ ok: true });
  })
);

const settingsSchema = z.object({
  valuePerPiece: z.union([z.coerce.number().min(0).max(100000), z.null(), z.literal("")]).optional(),
  targetOee: z.coerce.number().min(0.1).max(1).optional(),
});

router.get("/settings", ...manager, asyncHandler(async (req, res) => res.json(await getSettings())));
router.put(
  "/settings",
  ...manager,
  validateBody(settingsSchema),
  asyncHandler(async (req, res) => res.json(await saveSettings(req.body)))
);

// Ask the agent (Claude with tools over the same engine).
const askLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many questions in a short time. Try again in a minute." },
});
const askSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(20),
  from: day.optional(),
  to: day.optional(),
  family: z.string().max(50).optional(),
});

router.post(
  "/ask",
  ...manager,
  askLimiter,
  validateBody(askSchema),
  asyncHandler(async (req, res) => {
    const ctl = new AbortController();
    req.on("close", () => {
      if (!res.writableEnded) ctl.abort();
    });
    res.json(await ask(req.body, ctl.signal));
  })
);

export default router;
