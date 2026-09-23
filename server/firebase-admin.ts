/**
 * Firebase Admin SDK — Server-side.
 *
 * Initializes Firebase Admin using a Service Account.
 *
 * Set the following environment variables:
 *   FIREBASE_PROJECT_ID     — from Service Account JSON
 *   FIREBASE_CLIENT_EMAIL   — from Service Account JSON
 *   FIREBASE_PRIVATE_KEY    — from Service Account JSON (with \n literal)
 *
 * All three are required for user management (createUser, updateUser, deleteUser).
 * Without them, Firebase Admin will log a warning and user management will be skipped.
 */

import admin from "firebase-admin";

let adminInitialized = false;
let adminAuth: admin.auth.Auth | null = null;

function initAdmin() {
  if (adminInitialized) return;

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    console.warn(
      "[firebase-admin] FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY " +
        "not set — server-side user management (vendor create/update/delete) will be skipped."
    );
    adminInitialized = true;
    return;
  }

  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }

  adminAuth = admin.auth();
  adminInitialized = true;
  console.log("[firebase-admin] Initialized for project:", projectId);
}

// ── User management ───────────────────────────────────────────────────────────

/**
 * Create a Firebase Auth user (email + password).
 * Returns the new user's UID or an error message.
 */
export async function adminCreateUser(
  email: string,
  password: string,
  displayName?: string
): Promise<{ id?: string; error?: string }> {
  initAdmin();
  if (!adminAuth) {
    console.warn("[firebase-admin] Skipping user creation — Admin SDK not configured.");
    return { id: undefined };
  }
  try {
    const user = await adminAuth.createUser({ email, password, displayName });
    console.log(`[firebase-admin] Created user ${user.uid} (${email})`);
    return { id: user.uid };
  } catch (err: any) {
    console.error("[firebase-admin] createUser error:", err.message);
    return { error: err.message };
  }
}

/**
 * Update a Firebase Auth user's email, password, or displayName.
 */
export async function adminUpdateUser(
  uid: string,
  updates: { email?: string; password?: string; displayName?: string }
): Promise<{ error?: string }> {
  initAdmin();
  if (!adminAuth) {
    console.warn("[firebase-admin] Skipping user update — Admin SDK not configured.");
    return {};
  }
  try {
    await adminAuth.updateUser(uid, updates);
    console.log(`[firebase-admin] Updated user ${uid}`);
    return {};
  } catch (err: any) {
    console.error("[firebase-admin] updateUser error:", err.message);
    return { error: err.message };
  }
}

/**
 * Delete a Firebase Auth user by UID.
 */
export async function adminDeleteUser(uid: string): Promise<{ error?: string }> {
  initAdmin();
  if (!adminAuth) {
    console.warn("[firebase-admin] Skipping user delete — Admin SDK not configured.");
    return {};
  }
  try {
    await adminAuth.deleteUser(uid);
    console.log(`[firebase-admin] Deleted user ${uid}`);
    return {};
  } catch (err: any) {
    console.error("[firebase-admin] deleteUser error:", err.message);
    return { error: err.message };
  }
}

/**
 * Verify a Firebase ID Token from an Authorization: Bearer <token> header.
 * Returns the decoded token payload (uid, email, etc.) or null.
 */
export async function verifyIdToken(
  idToken: string
): Promise<admin.auth.DecodedIdToken | null> {
  initAdmin();
  if (!adminAuth) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    return decoded;
  } catch {
    return null;
  }
}

