import { z } from "zod";

const id = z.coerce.number().int().positive();
const qty = z.coerce.number().int().min(0);

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const createUserSchema = z.object({
  username: z.string().min(3).max(255),
  password: z.string().min(6).max(255),
  role: z.enum(["manager", "operator"]),
  displayName: z.string().max(255).optional(),
});

export const productSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
});

export const processSchema = z.object({
  name: z.string().min(1).max(255),
});

export const machineSchema = z.object({
  name: z.string().min(1).max(255),
  processIds: z.array(id).optional(),
});

export const productChainSchema = z.object({
  // Ordered list of processes for a product.
  processes: z
    .array(z.object({ processId: id, sequence: z.coerce.number().int().min(1) }))
    .min(1),
});

export const inventorySetSchema = z.object({
  availableQuantity: qty,
});

export const inventoryAdjustSchema = z.object({
  delta: z.coerce.number().int(),
});

export const createWorkOrderSchema = z.object({
  customerName: z.string().min(1).max(255),
  productId: id,
  quantity: z.coerce.number().int().positive(),
  dueDate: z.string().datetime().nullish().or(z.string().length(0)).nullable().optional(),
});

export const updateWorkOrderSchema = z.object({
  customerName: z.string().min(1).max(255).optional(),
  dueDate: z.string().nullable().optional(),
});

export const assignSchema = z.object({
  machines: z
    .array(z.object({ machineId: id, assignedQuantity: z.coerce.number().int().positive() }))
    .default([]),
});

export const completeSchema = z.object({
  quantity: z.coerce.number().int().positive(),
});
