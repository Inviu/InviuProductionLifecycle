import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../config/db.js";
import { usersTable } from "../db/schema.js";
import { AppError } from "../middleware/validate.js";
import { signToken } from "../middleware/auth.js";

const SALT_ROUNDS = 10;

export async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

function publicUser(u) {
  return { id: u.id, username: u.username, role: u.role, displayName: u.displayName };
}

export async function login(username, password) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  // Constant-ish time: always run a compare to reduce username enumeration.
  const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !ok) throw new AppError("Invalid username or password", 401);
  return { token: signToken(user), user: publicUser(user) };
}

export async function getUser(id) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) throw new AppError("User not found", 404);
  return publicUser(user);
}

export async function createUser({ username, password, role, displayName }) {
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (existing) throw new AppError("Username already taken", 409);
  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(usersTable)
    .values({ username, passwordHash, role, displayName: displayName ?? username })
    .returning();
  return publicUser(user);
}

export async function listUsers() {
  const users = await db.select().from(usersTable);
  return users.map(publicUser);
}
