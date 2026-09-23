/**
 * Firebase Admin SDK — Server-side.
 *
 * Handles administrative actions:
 * - Creating Firebase Auth users for new vendors (with email {phone}@gmail.com & password)
 * - Updating Firebase Auth users (passwords & phone/email changes)
 * - Deleting Firebase Auth users
 * - Verifying ID tokens
 *
 * Supported credentials in .env:
 * 1. FIREBASE_SERVICE_ACCOUNT_KEY: path to serviceAccountKey.json OR raw JSON string
 * 2. GOOGLE_APPLICATION_CREDENTIALS: path to serviceAccountKey.json
 * 3. FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY
 */

import admin from "firebase-admin";
import fs from "fs";
import path from "path";

let adminInitialized = false;
let adminAuth: admin.auth.Auth | null = null;

function initAdmin() {
  if (adminInitialized) return;

  try {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;

    // 1. Check if FIREBASE_SERVICE_ACCOUNT_KEY is set (file path or JSON string)
    const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccountEnv) {
      let serviceAccount: any;
      if (serviceAccountEnv.trim().startsWith("{")) {
        serviceAccount = JSON.parse(serviceAccountEnv);
      } else {
        const filePath = path.isAbsolute(serviceAccountEnv)
          ? serviceAccountEnv
          : path.resolve(process.cwd(), serviceAccountEnv);
        if (fs.existsSync(filePath)) {
          serviceAccount = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        }
      }

      if (serviceAccount) {
        if (admin.apps.length === 0) {
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id || projectId,
          });
        }
        adminAuth = admin.auth();
        adminInitialized = true;
        console.log("[firebase-admin] Initialized via FIREBASE_SERVICE_ACCOUNT_KEY for project:", projectId);
        return;
      }
    }

    // 2. Check GOOGLE_APPLICATION_CREDENTIALS file path
    const googleAppCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (googleAppCreds && fs.existsSync(googleAppCreds)) {
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          projectId,
        });
      }
      adminAuth = admin.auth();
      adminInitialized = true;
      console.log("[firebase-admin] Initialized via GOOGLE_APPLICATION_CREDENTIALS");
      return;
    }

    // 3. Check individual env variables
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (projectId && clientEmail && privateKey) {
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        });
      }
      adminAuth = admin.auth();
      adminInitialized = true;
      console.log("[firebase-admin] Initialized via CLIENT_EMAIL & PRIVATE_KEY for project:", projectId);
      return;
    }

    console.warn(
      "[firebase-admin] Service Account credentials not provided. " +
      "Server-side vendor account creation and password updates in Firebase will require FIREBASE_SERVICE_ACCOUNT_KEY."
    );
    adminInitialized = true;
  } catch (err: any) {
    console.error("[firebase-admin] Initialization error:", err.message);
    adminInitialized = true;
  }
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
    return {
      error: "Firebase Service Account key is required on the server to automatically create vendor logins in Firebase. Set FIREBASE_SERVICE_ACCOUNT_KEY in .env.",
    };
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
    return {
      error: "Firebase Service Account key is required on the server to sync password updates to Firebase. Set FIREBASE_SERVICE_ACCOUNT_KEY in .env.",
    };
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
    return {
      error: "Firebase Service Account key is required on the server to delete vendor logins from Firebase.",
    };
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
