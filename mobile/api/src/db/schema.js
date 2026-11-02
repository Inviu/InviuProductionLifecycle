 import { pgTable, serial, text, integer, varchar, timestamp } from "drizzle-orm/pg-core";


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
        machineId: integer("machine_id")
            .notNull()
            .references(() => machinesTable.id, { onDelete: "cascade" }),
        workerName: varchar("worker_name", { length: 255 }).notNull(),
        shiftStartTime: timestamp("shift_start_time").notNull(),
        shiftEndTime: timestamp("shift_end_time").notNull(),
        date: timestamp("date").defaultNow().notNull(),
        unitsProduced: integer("units_produced").notNull(),
        productionIssueReason: text("production_issue_reason"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
});
