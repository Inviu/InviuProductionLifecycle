import {
  pgTable,
  serial,
  text,
  integer,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";

// Application users. role is 'manager' or 'operator'.
export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull(), // manager | operator
  displayName: varchar("display_name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Append-only audit trail: who did what, when.
export const auditLogTable = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"), // nullable: system actions
  action: varchar("action", { length: 100 }).notNull(),
  entity: varchar("entity", { length: 50 }),
  entityId: integer("entity_id"),
  details: text("details"), // JSON string
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  // Product family, e.g. "Rod components" or "Sheet metal" — groups the app's product list.
  category: varchar("category", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Which shift-log form the app shows for a step:
//   machining       date, start/end, pcs made, breakdown (start/end/reason)
//   machining_bits  machining + bit change (no. of bits)
//   inspection      units inspected, rejections, good parts
//   count           no. of units (waiting/in/received plating, pallet, dispatch)
//   packing         units + no. of boxes
export const FORM_TYPES = ["machining", "machining_bits", "inspection", "count", "packing"];

export const processesTable = pgTable("processes", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  // Target good output per hour at full speed — used for the Performance factor of OEE.
  standardRatePerHour: integer("standard_rate_per_hour"),
  formType: varchar("form_type", { length: 30 }).notNull().default("machining"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const productProcessMappingTable = pgTable("product_process_mapping", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  processId: integer("process_id")
    .notNull()
    .references(() => processesTable.id, { onDelete: "cascade" }),
  // Position of this process in the product's chain (1-based). Lower runs first.
  sequence: integer("sequence").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const machinesTable = pgTable("machines", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const machineProcessMappingTable = pgTable("machine_process_mapping", {
  id: serial("id").primaryKey(),
  processId: integer("process_id")
    .notNull()
    .references(() => processesTable.id, { onDelete: "cascade" }),
  machineId: integer("machine_id")
    .notNull()
    .references(() => machinesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workerTable = pgTable("worker", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const productionEntryTable = pgTable("production_entry", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  processId: integer("process_id")
    .notNull()
    .references(() => processesTable.id, { onDelete: "cascade" }),
  // Nullable: some processes have no machine; the app logs an entry with no machine in that case.
  machineId: integer("machine_id").references(() => machinesTable.id, {
    onDelete: "cascade",
  }),
  workerName: varchar("worker_name", { length: 255 }).notNull(),
  // Nullable: entries generated from a work-order completion have no shift window.
  shiftStartTime: timestamp("shift_start_time"),
  shiftEndTime: timestamp("shift_end_time"),
  date: timestamp("date").defaultNow().notNull(),
  unitsProduced: integer("units_produced").notNull(), // good units
  // OEE inputs (optional; default 0): scrap for Quality, downtime minutes for Availability.
  rejectedUnits: integer("rejected_units").notNull().default(0),
  downtimeMinutes: integer("downtime_minutes").notNull().default(0),
  downtimeReason: text("downtime_reason"),
  // Breakdown window (machining steps). downtimeMinutes is derived from it.
  breakdownStart: timestamp("breakdown_start"),
  breakdownEnd: timestamp("breakdown_end"),
  // Drill/chamfer bits changed this shift (0 = no bit change).
  bitsChanged: integer("bits_changed").notNull().default(0),
  // Inspection steps: units inspected (good = inspected - rejected).
  unitsInspected: integer("units_inspected"),
  // Packing steps: boxes packed.
  boxes: integer("boxes"),
  productionIssueReason: text("production_issue_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

//new schema

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  customerName: varchar("customer_name", { length: 255 }).notNull(),

  productId: integer("product_id")
    .notNull()
    .references(() => productsTable.id),

  quantity: integer("quantity").notNull(),
  status: varchar("status", { length: 50 }).notNull(), // Created | In Progress | Completed

  createdDate: timestamp("created_date").defaultNow().notNull(),
  dueDate: timestamp("due_date"),
});

export const orderProcessesTable = pgTable("order_processes", {
  id: serial("id").primaryKey(),

  orderId: integer("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),

  processId: integer("process_id")
    .notNull()
    .references(() => processesTable.id),

  availableQuantity: integer("available_quantity").notNull(),
  completedQuantity: integer("completed_quantity").default(0).notNull(),

  status: varchar("status", { length: 50 }).notNull(), // Ready | Assigned | Completed

  sequence: integer("sequence").notNull(), // process order (Cutting → Plating → Chaffing)

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orderProcessMachineTable = pgTable("order_process_machine", {
  id: serial("id").primaryKey(),

  orderProcessId: integer("order_process_id")
    .notNull()
    .references(() => orderProcessesTable.id, { onDelete: "cascade" }),

  machineId: integer("machine_id")
    .notNull()
    .references(() => machinesTable.id),

  assignedQuantity: integer("assigned_quantity").notNull(),
  completedQuantity: integer("completed_quantity").default(0).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const productProcessInventoryTable = pgTable(
  "product_process_inventory",
  {
    id: serial("id").primaryKey(),

    // Product reference
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),

    // Process reference
    processId: integer("process_id")
      .notNull()
      .references(() => processesTable.id, { onDelete: "cascade" }),

    // Total units available in inventory
    availableQuantity: integer("available_quantity").notNull().default(0),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  }
);

// Efficiency agent: what people did with a recommendation. "done" stores the
// metric at that moment so the page can show the before/after result later;
// "rejected" (marked "Not the cause") lowers that rule's confidence.
export const agentFeedbackTable = pgTable("agent_feedback", {
  id: serial("id").primaryKey(),
  rule: varchar("rule", { length: 40 }).notNull(),
  scope: varchar("scope", { length: 120 }).notNull(), // e.g. "machine:20", "step:3"
  title: text("title").notNull(),
  action: varchar("action", { length: 20 }).notNull(), // done | rejected
  metricKind: varchar("metric_kind", { length: 40 }),
  metricKey: varchar("metric_key", { length: 120 }),
  metricLabel: varchar("metric_label", { length: 120 }),
  metricBefore: text("metric_before"), // number as text (nullable)
  userId: integer("user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Plant-level settings (key/value), e.g. value per good piece, target OEE.
export const appSettingsTable = pgTable("app_settings", {
  key: varchar("key", { length: 60 }).primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
