import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { config } from "../config.js";
import * as schema from "./schema.js";

const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  // 50 concurrent tenants × ~4 parallel queries each = ~200 peak queries.
  // With 30 connections and pipelining, this handles the load without
  // exhausting Supabase's connection limit (typically 60–200 depending on plan).
  max: 30,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const db = drizzle(pool, { schema });

export type DB = typeof db;
