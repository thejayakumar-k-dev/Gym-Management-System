/**
 * Admin access configuration.
 *
 * Only the Supabase auth user with this UID may access the admin panel.
 */
export const ADMIN_ID = "dba99346-ca61-4cdd-8bbe-d2229eda1978";

/** Returns true if the given (or current) Supabase user is the admin. */
export function isAdminUser(user?: { id?: string | null } | null): boolean {
  return !!user && user.id === ADMIN_ID;
}
