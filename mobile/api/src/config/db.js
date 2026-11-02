import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { ENV } from "./env.js";
import { productsTable, processesTable, machinesTable } from "../db/schema.js";

const sql = neon(ENV.DATABASE_URL);
const schema = { productsTable, processesTable, machinesTable };
export const db = drizzle(sql, { schema });