import { sql } from "drizzle-orm";
import { db } from "../config/db.js";
import { ordersTable, orderProcessesTable } from "../db/schema.js";

/** High-level production summary for the manager dashboard. */
export async function getSummary() {
  const byStatus = await db
    .select({ status: ordersTable.status, count: sql`count(*)::int` })
    .from(ordersTable)
    .groupBy(ordersTable.status);

  const [totals] = await db
    .select({
      orders: sql`count(*)::int`,
    })
    .from(ordersTable);

  // Aggregate unit progress across all order processes.
  const [units] = await db
    .select({
      planned: sql`coalesce(sum(${orderProcessesTable.availableQuantity}),0)::int`,
      completed: sql`coalesce(sum(${orderProcessesTable.completedQuantity}),0)::int`,
    })
    .from(orderProcessesTable);

  const statusMap = { Pending: 0, "In Progress": 0, Completed: 0 };
  for (const r of byStatus) statusMap[r.status] = r.count;

  return {
    totalOrders: totals?.orders ?? 0,
    ordersByStatus: statusMap,
    units: {
      planned: units?.planned ?? 0,
      completed: units?.completed ?? 0,
    },
  };
}
