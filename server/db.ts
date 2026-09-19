import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import * as schema from "../shared/schema.js";

// ── Project connection cache ──────────────────────────────────────────
// Each Neon project (Gym-Admin, Gym 1, Gym 2, ...) gets its own
// Drizzle instance keyed by a project identifier.
// Currently only "gym-admin" is configured; more projects will be
// added later via the vendor_neon_projects table.

const connections = new Map<string, ReturnType<typeof drizzleNeon<typeof schema>>>();

/**
 * Get (or create) a Drizzle ORM instance for a Neon project.
 * Falls back to the default NEON_DATABASE_URL env var when no
 * explicit URL is passed.
 */
export function getDb(databaseUrl?: string) {
  const url = databaseUrl || process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Missing DATABASE_URL environment variable");
  }

  // Reuse an existing connection for the same URL
  if (!connections.has(url)) {
    const sql = neon(url);
    connections.set(url, drizzleNeon(sql, { schema }));
  }
  return connections.get(url)!;
}

/** Default database instance (Gym-Admin). */
export const db = getDb();
