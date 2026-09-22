/**
 * Admin access configuration.
 *
 * The platform admin logs in with the phone number defined in
 * ADMIN_CONTACT_NUMBER (shared/schema.ts).  On the Neon Auth side the
 * admin's email is `{phone}@gmail.com`, so we identify the admin by
 * matching the user's email prefix against that phone number.
 */

import { ADMIN_CONTACT_NUMBER } from "@shared/schema";

/** The admin email prefix used for Neon Auth sign-up. */
const ADMIN_EMAIL = `${ADMIN_CONTACT_NUMBER}@gmail.com`;

/**
 * Returns true if the given Neon Auth user is the platform admin.
 * Accepts either a full user object with `email` or a plain `{ id }`.
 */
export function isAdminUser(
  user?: { id?: string | null; email?: string | null } | null
): boolean {
  if (!user) return false;
  // Primary check: email matches the admin phone pattern
  if (user.email === ADMIN_EMAIL) return true;
  // Legacy fallback: if a user already has the hardcoded Supabase UID
  // stored from a previous migration, treat them as admin too.
  if (user.id === "dba99346-ca61-4cdd-8bbe-d2229eda1978") return true;
  return false;
}
