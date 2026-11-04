import { z } from "zod";

const id = z.coerce.number().int().positive();
const qty = z.coerce.number().int().min(0);
// A due date: an ISO datetime, an empty string, or null — all optional.
const dueDate = z.union([z.string().datetime(), z.literal(""), z.null()]).optional();

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
  category: z.union([z.string().max(50), z.null()]).optional(),
});

export const processSchema = z.object({
  name: z.string().min(1).max(255),
  // Target good units/hr at full speed — drives the OEE Performance factor.
  standardRatePerHour: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  // Which shift-log form the app shows for this step.
  formType: z.enum(["machining", "machining_bits", "inspection", "count", "packing"]).optional(),
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
  dueDate,
});

export const updateWorkOrderSchema = z.object({
  customerName: z.string().min(1).max(255).optional(),
  dueDate,
});

export const assignSchema = z.object({
  machines: z
    .array(z.object({ machineId: id, assignedQuantity: z.coerce.number().int().positive() }))
    .default([]),
});

export const completeSchema = z.object({
  quantity: z.coerce.number().int().positive(),
  // Optional production detail captured at completion time.
  machineId: z.union([id, z.null()]).optional(),
  productionIssueReason: z
    .union([z.string(), z.array(z.string()), z.null()])
    .optional(),
});

// A clock time in 24h HH:MM form.
const timeHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:MM (24h) format");

// A shift production entry logged from the shop floor (mobile app).
export const productionEntrySchema = z.object({
  productId: id,
  processId: id,
  // Optional: some processes have no machine.
  machineId: z.union([id, z.null()]).optional(),
  // Optional: falls back to the logged-in user when omitted.
  workerName: z.string().min(1).max(255).optional(),
  shiftStartTime: timeHHMM,
  shiftEndTime: timeHHMM,
  // Good units. Optional only when unitsInspected is given (good = inspected - rejected).
  unitsProduced: z.coerce.number().int().min(0).optional(),
  // OEE inputs (optional): scrap count and downtime minutes for this shift.
  rejectedUnits: z.coerce.number().int().min(0).optional(),
  downtimeMinutes: z.coerce.number().int().min(0).optional(),
  downtimeReason: z.union([z.string(), z.null()]).optional(),
  // Breakdown window (HH:MM, same shift); downtime minutes are derived from it.
  breakdownStartTime: z.union([timeHHMM, z.null()]).optional(),
  breakdownEndTime: z.union([timeHHMM, z.null()]).optional(),
  // Number of bits changed this shift (drilling / chamfer).
  bitsChanged: z.coerce.number().int().min(0).optional(),
  // Inspection: units inspected (rejectedUnits = rejections).
  unitsInspected: z.union([z.coerce.number().int().min(0), z.null()]).optional(),
  // Packing: boxes packed.
  boxes: z.union([z.coerce.number().int().min(0), z.null()]).optional(),
  // Optional entry date (ISO or YYYY-MM-DD); defaults to today.
  date: z.union([z.string(), z.null()]).optional(),
  // One reason, a list of reasons, or none.
  productionIssueReason: z
    .union([z.string(), z.array(z.string()), z.null()])
    .optional(),
})
  .refine((v) => v.unitsProduced != null || v.unitsInspected != null, {
    message: "Enter units produced (or units inspected)",
    path: ["unitsProduced"],
  })
  .refine((v) => v.unitsInspected == null || (v.rejectedUnits ?? 0) <= v.unitsInspected, {
    message: "Rejections cannot exceed units inspected",
    path: ["rejectedUnits"],
  })
  .refine((v) => !v.breakdownStartTime === !v.breakdownEndTime, {
    message: "Give both breakdown start and end time",
    path: ["breakdownEndTime"],
  });
