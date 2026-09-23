/**
 * Migration runner — applies the Drizzle schema to a Neon database.
 *
 * Used when creating a new gym project: after the Neon project is created,
 * this runner creates all tables (students, payments, attendance, etc.)
 * in the new database.
 *
 * Uses raw SQL via the Neon serverless driver (no drizzle-kit needed at runtime).
 */

import { neon } from "@neondatabase/serverless";

/**
 * SQL statements to create all tables.
 * Derived from shared/schema.ts — keep in sync with schema changes.
 */
const CREATE_TABLES_SQL = [
  // Students
  `CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    register_no VARCHAR(50) NOT NULL UNIQUE,
    name TEXT NOT NULL,
    phone VARCHAR(20) NOT NULL,
    address TEXT NOT NULL,
    join_date DATE NOT NULL,
    expiry_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,

  // Payments
  `CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    token_number VARCHAR(50) NOT NULL UNIQUE,
    date DATE NOT NULL,
    student_id INTEGER NOT NULL,
    register_no VARCHAR(50) NOT NULL,
    student_name TEXT NOT NULL,
    duration INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    payment_method VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,

  // Attendance
  `CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    register_no VARCHAR(50) NOT NULL,
    student_name TEXT NOT NULL,
    time_in TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,

  // Platform settings (single row)
  `CREATE TABLE IF NOT EXISTS platform_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    platform_fee INTEGER NOT NULL DEFAULT 999,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,

  // Membership plans (per-gym plan prices keyed by duration in months)
  `CREATE TABLE IF NOT EXISTS membership_plans (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    duration_months INTEGER NOT NULL UNIQUE,
    price INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT ''`,
];

/**
 * Apply all table schemas to the given database URL.
 * Safe to run multiple times (uses IF NOT EXISTS).
 */
export async function runMigration(databaseUrl: string): Promise<{
  success: boolean;
  tablesCreated: number;
  error?: string;
}> {
  try {
    const sql = neon(databaseUrl);
    let tablesCreated = 0;

    for (const stmt of CREATE_TABLES_SQL) {
      await sql(stmt);
      tablesCreated++;
    }

    console.log(`[migrate] Applied ${tablesCreated} table definitions`);
    return { success: true, tablesCreated };
  } catch (error: any) {
    console.error("[migrate] Migration failed:", error.message);
    return { success: false, tablesCreated: 0, error: error.message };
  }
}
