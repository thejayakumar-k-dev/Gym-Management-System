/**
 * Server Authentication Module — Firebase.
 *
 * - Token verification: verifies Firebase ID tokens from Authorization: Bearer <token> header.
 * - User management: creates/updates/deletes Firebase Auth users for vendors.
 */

import type { Express, Request, Response, NextFunction } from "express";
import {
  verifyIdToken,
  adminCreateUser,
  adminUpdateUser,
  adminDeleteUser,
} from "./firebase-admin.js";

// ── Public types ──────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
}

export interface AuthSession {
  user: AuthUser;
}

// ── Session validation ────────────────────────────────────────────────────────

/**
 * Extract and verify the Firebase ID token from the Authorization header.
 * Returns the decoded session or null.
 */
export async function validateSession(req: Request): Promise<AuthSession | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;

  const idToken = authHeader.slice(7);
  const decoded = await verifyIdToken(idToken);
  if (!decoded) return null;

  return {
    user: {
      id: decoded.uid,
      email: decoded.email,
      name: decoded.name,
    },
  };
}

// ── Express middleware ────────────────────────────────────────────────────────

/**
 * Attaches the validated session to `req.auth`. Does NOT block unauthenticated requests.
 */
export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const session = await validateSession(req);
  (req as any).auth = session;
  next();
}

/**
 * Blocks unauthenticated requests with 401.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = await validateSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  (req as any).auth = session;
  next();
}

// ── Firebase user management (vendor accounts) ────────────────────────────────

/**
 * Create a Firebase Auth user for a vendor.
 * Called when creating a vendor so they can log in.
 */
export async function createNeonAuthUser(
  email: string,
  password: string,
  name?: string
): Promise<{ id?: string; error?: string }> {
  return adminCreateUser(email, password, name);
}

/**
 * Update a vendor's Firebase Auth user (email, password, displayName).
 */
export async function updateNeonAuthUser(
  userId: string,
  updates: { email?: string; password?: string; name?: string }
): Promise<{ error?: string }> {
  return adminUpdateUser(userId, {
    email: updates.email,
    password: updates.password,
    displayName: updates.name,
  });
}

/**
 * Delete a vendor's Firebase Auth user.
 */
export async function deleteNeonAuthUser(uid: string): Promise<{ error?: string }> {
  return adminDeleteUser(uid);
}

// ── Express route setup ───────────────────────────────────────────────────────

/**
 * No proxy routes needed — Firebase Auth handles auth directly.
 */
export function setupNeonAuthRoutes(_app: Express) {
  // No-op: Firebase Auth is handled client-side; no proxy needed.
}

export const setupAuthRoutes = setupNeonAuthRoutes;
