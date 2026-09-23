/**
 * Admin access configuration.
 *
 * Checks if a logged-in Firebase user matches the platform admin UID.
 * The Admin UID is configured in environment variable: VITE_ADMIN_UID
 */

export const ADMIN_UID = import.meta.env.VITE_ADMIN_UID || "";

/**
 * Returns true if the given user is the platform admin based on Firebase UID.
 */
export function isAdminUser(
  user?: { id?: string | null; email?: string | null; uid?: string | null } | null
): boolean {
  if (!user) return false;
  const uid = user.id || user.uid;
  if (!uid) return false;
  // Match configured ADMIN_UID
  if (ADMIN_UID && uid === ADMIN_UID) return true;
  return false;
}
