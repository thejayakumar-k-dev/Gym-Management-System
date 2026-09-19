/**
 * Neon Auth client — replaces the old Supabase client.
 *
 * Uses @neondatabase/auth with the default Better Auth API.
 * Methods: signIn.email, signUp.email, getSession, signOut.
 *
 * Auth state is managed manually:
 * - On mount: call getSession() to check if user is logged in
 * - After login: call getSession() to get the new user
 * - After logout: clear user state manually
 */

import { createAuthClient } from "@neondatabase/auth";

const authUrl = import.meta.env.VITE_NEON_AUTH_URL;

if (!authUrl) {
  throw new Error("Missing VITE_NEON_AUTH_URL environment variable");
}

/**
 * Neon Auth client with Better Auth API.
 */
export const neonAuth = createAuthClient(authUrl);

/**
 * Sign in with email/password.
 */
export async function signInWithPassword({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  return neonAuth.signIn.email({ email, password });
}

/**
 * Sign up with email/password/name.
 */
export async function signUpWithEmail({
  email,
  password,
  name,
}: {
  email: string;
  password: string;
  name: string;
}) {
  return neonAuth.signUp.email({ email, password, name });
}

/**
 * Get current session.
 * Returns { data: { session: { user, session } } } or { data: null }.
 */
export async function getSession() {
  const result = await neonAuth.getSession();
  return {
    data: result.data
      ? { session: result.data }
      : null,
  };
}

/**
 * Sign out.
 */
export async function signOut() {
  return neonAuth.signOut();
}
