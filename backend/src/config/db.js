import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { ENV } from "./env.js";
import * as schema from "../db/schema.js";

// Enable SSL for hosted databases (e.g. Neon); plain for local Postgres.
const needsSsl = /neon\.tech|sslmode=require/.test(ENV.DATABASE_URL || "");

export const pool = new pg.Pool({
  connectionString: ENV.DATABASE_URL,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool, { schema });