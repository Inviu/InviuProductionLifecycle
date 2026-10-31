import { Router } from "express";
import { asyncHandler, validateBody } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { login, getUser, createUser, listUsers } from "../services/auth.service.js";
import { loginSchema, createUserSchema } from "../validators.js";

const router = Router();

router.post(
  "/login",
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await login(req.body.username, req.body.password);
    res.json(result);
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getUser(req.user.id));
  })
);

// Manager-only user management.
router.get(
  "/users",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    res.json(await listUsers());
  })
);

router.post(
  "/users",
  requireAuth,
  requireRole("manager"),
  validateBody(createUserSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createUser(req.body));
  })
);

export default router;
