/**
 * Authentication Client — Firebase.
 *
 * All sign-in/sign-up/sign-out functions use Firebase Auth.
 * Auth state is observed via onAuthStateChanged.
 *
 * Usage pattern:
 * - getSession()         → check current session on mount
 * - signInWithPassword() → login form submit
 * - signOut()            → logout button
 * - getIdToken()         → get Bearer token to send to Express API
 */

import {
  auth,
  signInWithEmailAndPassword,
  firebaseSignOut,
  onAuthStateChanged,
  type User,
} from "@/lib/firebase";

export type { User };

export interface AuthUser {
  id: string;
  email: string | null;
  name?: string | null;
}

// ── Sign in ──────────────────────────────────────────────────────────────────

/**
 * Sign in with email and password via Firebase Auth.
 */
export async function signInWithPassword({
  email,
  password,
}: {
  email: string;
  password: string;
}): Promise<{ data?: { user: AuthUser }; error?: { message: string } }> {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return {
      data: {
        user: {
          id: credential.user.uid,
          email: credential.user.email,
          name: credential.user.displayName,
        },
      },
    };
  } catch (err: any) {
    const message = firebaseErrorMessage(err.code);
    return { error: { message } };
  }
}

// ── Get Session ──────────────────────────────────────────────────────────────

/**
 * Returns the currently signed-in Firebase user as a session object,
 * or null if no one is logged in.
 */
export async function getSession(): Promise<{
  data: { session: { user: AuthUser } } | null;
}> {
  const user = auth.currentUser;
  if (!user) return { data: null };
  return {
    data: {
      session: {
        user: {
          id: user.uid,
          email: user.email,
          name: user.displayName,
        },
      },
    },
  };
}

// ── Get ID Token ─────────────────────────────────────────────────────────────

/**
 * Get the Firebase ID token for the current user.
 * Sends this as `Authorization: Bearer <token>` to the Express API
 * for server-side verification.
 */
export async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

// ── Sign Out ─────────────────────────────────────────────────────────────────

/**
 * Sign out the current Firebase user.
 */
export async function signOut(): Promise<{ error?: { message: string } }> {
  try {
    await firebaseSignOut(auth);
    return {};
  } catch (err: any) {
    return { error: { message: err.message } };
  }
}

// ── Auth State Listener ───────────────────────────────────────────────────────

/**
 * Subscribe to Firebase auth state changes.
 * Returns an unsubscribe function.
 */
export function onAuthStateChange(
  callback: (user: AuthUser | null) => void
): () => void {
  return onAuthStateChanged(auth, (firebaseUser) => {
    if (firebaseUser) {
      callback({
        id: firebaseUser.uid,
        email: firebaseUser.email,
        name: firebaseUser.displayName,
      });
    } else {
      callback(null);
    }
  });
}

// ── Error Messages ───────────────────────────────────────────────────────────

function firebaseErrorMessage(code: string): string {
  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-email":
      return "Invalid phone number or password";
    case "auth/user-disabled":
      return "This account has been disabled";
    case "auth/too-many-requests":
      return "Too many failed attempts. Please try again later";
    case "auth/network-request-failed":
      return "Network error. Please check your connection";
    case "auth/email-already-in-use":
      return "An account with this phone number already exists";
    case "auth/weak-password":
      return "Password must be at least 6 characters";
    default:
      return "Sign in failed. Please try again";
  }
}
