import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import * as schema from "../shared/schema.js";

// ── Project connection cache ──────────────────────────────────────────
// Each Neon project (Gym-Admin, Gym 1, Gym 2, ...) gets its own
// Drizzle instance keyed by a project identifier.

const connections = new Map<string, ReturnType<typeof drizzleNeon<typeof schema>>>();

/**
 * Get (or create) a Drizzle ORM instance for a Neon project.
 * Falls back to DATABASE_URL or NEON_DATABASE_URL when no
 * explicit URL is passed.
 */
export function getDb(databaseUrl?: string) {
  const url = databaseUrl || process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) {
    throw new Error("Missing DATABASE_URL (or NEON_DATABASE_URL) environment variable");
  }

  // Reuse an existing connection for the same URL
  if (!connections.has(url)) {
    const sql = neon(url);
    connections.set(url, drizzleNeon(sql, { schema }));
  }
  return connections.get(url)!;
}

/** 
 * Default database instance (Gym-Admin).
 * Wrapped in a lazy Proxy so importing this module never crashes on boot if env vars
 * are still being populated or during cold-starts.
 */
let _defaultDb: ReturnType<typeof drizzleNeon<typeof schema>> | null = null;

export const db = new Proxy({} as ReturnType<typeof drizzleNeon<typeof schema>>, {
  get(_target, prop) {
    if (!_defaultDb) {
      _defaultDb = getDb();
    }
    return (_defaultDb as any)[prop];
  },
});
