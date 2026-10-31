import { desc, eq } from "drizzle-orm";
import { db } from "../config/db.js";
import { auditLogTable, usersTable } from "../db/schema.js";

/**
 * Record an audit entry. Accepts a db or transaction connection so it joins the
 * caller's transaction. Never throws out — auditing must not break the operation.
 * @param {object} conn - db or tx
 */
export async function recordAudit(conn, { userId, action, entity, entityId, details }) {
  try {
    await conn.insert(auditLogTable).values({
      userId: userId ?? null,
      action,
      entity: entity ?? null,
      entityId: entityId ?? null,
      details: details ? JSON.stringify(details) : null,
    });
  } catch (err) {
    console.error("Audit write failed (non-fatal):", err.message);
  }
}

export async function listAudit({ limit = 100 } = {}) {
  const rows = await db
    .select({
      id: auditLogTable.id,
      userId: auditLogTable.userId,
      username: usersTable.username,
      action: auditLogTable.action,
      entity: auditLogTable.entity,
      entityId: auditLogTable.entityId,
      details: auditLogTable.details,
      createdAt: auditLogTable.createdAt,
    })
    .from(auditLogTable)
    .leftJoin(usersTable, eq(usersTable.id, auditLogTable.userId))
    .orderBy(desc(auditLogTable.id))
    .limit(limit);

  return rows.map((r) => ({ ...r, details: r.details ? JSON.parse(r.details) : null }));
}
