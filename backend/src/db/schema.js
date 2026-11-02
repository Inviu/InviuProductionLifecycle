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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const processesTable = pgTable("processes", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
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
  unitsProduced: integer("units_produced").notNull(),
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
