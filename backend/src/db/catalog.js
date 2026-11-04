// Inviu production catalog: products, process steps, machines and routings.
// Source of truth for `npm run catalog:load` (see loadCatalog.js).

// ---- Process steps ----------------------------------------------------------
// formType picks the shift-log form the app shows (see FORM_TYPES in schema.js).
export const PROCESSES = [
  // Rod components (spindles)
  { name: "Cutting", formType: "machining" },
  { name: "Tip grinding", formType: "machining" },
  { name: "Drilling", formType: "machining_bits" },
  { name: "Chamfer", formType: "machining_bits" },
  { name: "Quality check", formType: "inspection" },
  // Sheet metal
  { name: "Blanking", formType: "machining" },
  { name: "Bending", formType: "machining" },
  { name: "Punching", formType: "machining" },
  { name: "Notching", formType: "machining" },
  // Shared finishing / logistics
  { name: "Waiting for plating", formType: "count" },
  { name: "In plating", formType: "count" },
  { name: "Received from plating", formType: "count" },
  { name: "Quality check (after plating)", formType: "inspection" },
  { name: "Packing", formType: "packing" },
  { name: "On pallet", formType: "count" },
  { name: "Ready for dispatch", formType: "count" },
  { name: "Dispatched", formType: "count" },
];

// ---- Machines ---------------------------------------------------------------
const range = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

export const MACHINE_GROUPS = [
  // Power presses: any sheet-metal operation / line production.
  { codes: range("PP", 14), processes: ["Blanking", "Bending", "Punching", "Notching"] },
  // Traub / cutting machines.
  { codes: range("TR", 4), processes: ["Cutting"] },
  { codes: range("DR", 13), processes: ["Drilling"] },
  { codes: range("CM", 2), processes: ["Chamfer"] },
  // Bench grinding / tip grinding.
  { codes: range("BG", 3), processes: ["Tip grinding"] },
];

// ---- Routings ---------------------------------------------------------------
const PLATING_TO_DISPATCH = [
  "Waiting for plating",
  "In plating",
  "Received from plating",
  "Quality check (after plating)",
  "Packing",
  "On pallet",
  "Ready for dispatch",
  "Dispatched",
];

const SPINDLE = [
  "Cutting",
  "Tip grinding",
  "Drilling",
  "Chamfer",
  "Quality check",
  ...PLATING_TO_DISPATCH,
];
const QUADRANT_BASE = ["Blanking", "Bending", "Punching", ...PLATING_TO_DISPATCH];
const QUADRANT_HANDLE = ["Blanking", "Bending", "Punching", "Notching", ...PLATING_TO_DISPATCH];
const CORNER = ["Blanking", "Bending", ...PLATING_TO_DISPATCH];
const PJ_CORNER = ["Blanking", "Packing", "On pallet", "Ready for dispatch", "Dispatched"];

// ---- Products ---------------------------------------------------------------
const ROD = "Rod components";
const SHEET = "Sheet metal";

export const PRODUCTS = [
  { name: "Square Spindle 12x12x55 mm", category: ROD, steps: SPINDLE },
  { name: "Square Spindle 12x12x70 mm (No Hole)", category: ROD, steps: SPINDLE },
  { name: "Square Spindle 12x12x75 mm", category: ROD, steps: SPINDLE },
  { name: "Square Spindle 12x12x95 mm", category: ROD, steps: SPINDLE },
  { name: "Square Spindle 12x12x80 mm", category: ROD, steps: SPINDLE },
  { name: "Square Spindle 12x12x100 mm", category: ROD, steps: SPINDLE },
  { name: "Square Spindle 12x12x120 mm", category: ROD, steps: SPINDLE },
  { name: "Square Spindle 12x12x170 mm", category: ROD, steps: SPINDLE },
  { name: "Square Spindle 12x12x200 mm", category: ROD, steps: SPINDLE },
  { name: "Round Spindle 12x12x80 mm", category: ROD, steps: SPINDLE },
  { name: "Round Spindle 12x12x120 mm", category: ROD, steps: SPINDLE },
  { name: "Round Spindle 12x12x170 mm", category: ROD, steps: SPINDLE },
  { name: "Round Spindle 12x12x200 mm", category: ROD, steps: SPINDLE },

  { name: "Quadrant Base", category: SHEET, steps: QUADRANT_BASE },
  { name: "Quadrant Handle", category: SHEET, steps: QUADRANT_HANDLE },
  { name: "Corner 20mm", category: SHEET, steps: CORNER },
  { name: "Corner 30mm", category: SHEET, steps: CORNER },
  { name: "PJ Corner", category: SHEET, steps: PJ_CORNER },
  { name: "Access Door Lock", category: SHEET, steps: CORNER },
  { name: "Access Door Cam", category: SHEET, steps: CORNER },
];
