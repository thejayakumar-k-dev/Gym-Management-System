/**
 * Neon Auth integration for Express.
 *
 * Architecture:
 * - Client → /api/auth/*  → Express proxy → Neon Auth service
 * - Express validates sessions by forwarding cookies to Neon Auth
 * - Admin user operations (create/update) call Neon Auth API
 */

import type { Express, Request, Response, NextFunction } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db.js";

// ── Configuration ─────────────────────────────────────────────────────
const NEON_AUTH_URL = process.env.NEON_AUTH_BASE_URL;

// Neon Auth requires an Origin header on POSTs (MISSING_ORIGIN otherwise).
// Server-to-server calls have no browser origin, so we send the auth
// service's own origin — same thing the /api/auth proxy does.
const authOrigin = NEON_AUTH_URL ? new URL(NEON_AUTH_URL).origin : undefined;
const authHeaders = (extra: Record<string, string> = {}) => ({
  ...(authOrigin ? { origin: authOrigin } : {}),
  ...extra,
});

if (!NEON_AUTH_URL) {
  console.warn(
    "[auth] NEON_AUTH_BASE_URL not set — auth routes will return 502"
  );
}

// No-op: expressToWebRequest is not needed since we proxy via fetch()

function applyWebResponseToExpress(webRes: globalThis.Response, expressRes: any) {
  expressRes.status(webRes.status);

  webRes.headers.forEach((value: string, key: string) => {
    const lk = key.toLowerCase();
    if (lk === "set-cookie") {
      expressRes.append("Set-Cookie", value);
    } else if (lk !== "transfer-encoding") {
      expressRes.setHeader(key, value);
    }
  });
}

// ── Public session validation ─────────────────────────────────────────
export interface NeonAuthUser {
  id: string;
  email: string;
  name: string;
}

export interface NeonAuthSession {
  user: NeonAuthUser;
  session: { id: string; [key: string]: unknown };
}

/**
 * Validate the current session by forwarding cookies to Neon Auth.
 * Returns the session data or null if not authenticated.
 */
export async function validateSession(
  req: Request
): Promise<NeonAuthSession | null> {
  if (!NEON_AUTH_URL) return null;

  try {
    const cookieHeader = req.headers.cookie || "";
    const response = await fetch(`${NEON_AUTH_URL}/get-session`, {
      headers: { cookie: cookieHeader },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      data?: { session?: Record<string, unknown>; user?: Record<string, unknown> };
    };

    // Neon Auth returns { session, user }; Better Auth variants wrap it
    // in { data: { session, user } }. Handle both shapes.
    const session = (data as any)?.data?.session ?? (data as any)?.session;
    const user = (data as any)?.data?.user ?? (data as any)?.user;
    if (session && user) {
      return {
        user: user as unknown as NeonAuthUser,
        session: session as unknown as NeonAuthSession["session"],
      };
    }

    return null;
  } catch (error) {
    console.error("[auth] Session validation error:", error);
    return null;
  }
}

/**
 * Express middleware: attaches the validated session to `req.auth`.
 * Does NOT block unauthenticated requests — use `requireAuth` for that.
 */
export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const session = await validateSession(req);
  (req as any).auth = session;
  next();
}

/**
 * Express middleware: blocks unauthenticated requests with 401.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const session = await validateSession(req);
  if (!session) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  (req as any).auth = session;
  next();
}

// ── Neon Auth user management (server-side) ───────────────────────────

/**
 * Create a new user via the Neon Auth API.
 * Used when creating a vendor to give them login credentials.
 */
export async function createNeonAuthUser(
  email: string,
  password: string,
  name: string
): Promise<{ id?: string; error?: string }> {
  if (!NEON_AUTH_URL) {
    return { error: "NEON_AUTH_BASE_URL not configured" };
  }

  try {
    const response = await fetch(`${NEON_AUTH_URL}/sign-up/email`, {
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ email, password, name }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: (data as any).message || "Failed to create user" };
    }

    // Neon Auth returns { token, user }; Better Auth variants return
    // { data: { user, session } }. Handle both shapes.
    const userId =
      (data as any)?.data?.user?.id ?? (data as any)?.user?.id;
    return userId ? { id: userId } : { error: "No user id in response" };
  } catch (error: any) {
    console.error("[auth] createNeonAuthUser error:", error.message);
    return { error: error.message };
  }
}

/**
 * Update a user's email/password/name.
 *
 * - Password: Neon Auth's /admin/set-user-password (needs the acting
 *   admin's session cookie, forwarded by the Express route).
 * - Email/name: written directly to neon_auth.user — Neon Auth stores
 *   users in our own Postgres. Its /update-user endpoint can NOT be used
 *   here: it only mutates the calling session's own user and rejects
 *   email changes ("Email can not be updated").
 */
export async function updateNeonAuthUser(
  userId: string,
  updates: { email?: string; password?: string; name?: string },
  sessionCookie?: string
): Promise<{ error?: string }> {
  // ── Profile (email / name) → direct DB update ──
  if (updates.email !== undefined || updates.name !== undefined) {
    try {
      const assignments = [];
      if (updates.name !== undefined) {
        assignments.push(sql`name = ${updates.name}`);
      }
      if (updates.email !== undefined) {
        assignments.push(sql`email = ${updates.email}`);
      }
      await db.execute(sql`
        UPDATE neon_auth.user
        SET ${sql.join(assignments, sql`, `)}, "updatedAt" = now()
        WHERE id = ${userId}`);
    } catch (error: any) {
      const msg = String(error?.message ?? error);
      if (/unique|duplicate/i.test(msg)) {
        return { error: "That login email is already used by another user" };
      }
      console.error("[auth] profile update error:", msg);
      return { error: `Profile update failed: ${msg}` };
    }
  }

  // ── Password → Neon Auth admin endpoint ──
  if (updates.password) {
    if (!NEON_AUTH_URL) {
      return { error: "NEON_AUTH_BASE_URL not configured" };
    }
    if (!sessionCookie) {
      return { error: "Admin session required to change a password" };
    }
    try {
      const response = await fetch(`${NEON_AUTH_URL}/admin/set-user-password`, {
        method: "POST",
        headers: authHeaders({
          "content-type": "application/json",
          cookie: sessionCookie,
        }),
        body: JSON.stringify({ userId, newPassword: updates.password }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        return {
          error:
            (data as any).message ||
            `Password update failed (${response.status})`,
        };
      }
    } catch (error: any) {
      console.error("[auth] updateNeonAuthUser error:", error.message);
      return { error: error.message };
    }
  }

  return {};
}

/**
 * Delete a user via the Neon Auth API.
 */
export async function deleteNeonAuthUser(
  userId: string,
  sessionCookie?: string
): Promise<{ error?: string }> {
  if (!NEON_AUTH_URL) {
    return { error: "NEON_AUTH_BASE_URL not configured" };
  }

  try {
    const response = await fetch(`${NEON_AUTH_URL}/admin/remove-user`, {
      method: "POST",
      headers: authHeaders({
        "content-type": "application/json",
        ...(sessionCookie ? { cookie: sessionCookie } : {}),
      }),
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        error:
          (data as any).message || `Failed to delete user (${response.status})`,
      };
    }

    return {};
  } catch (error: any) {
    console.error("[auth] deleteNeonAuthUser error:", error.message);
    return { error: error.message };
  }
}

// ── Express route setup ───────────────────────────────────────────────

/**
 * Mount Neon Auth proxy routes on the Express app.
 * All requests to /api/auth/* are forwarded to the Neon Auth service.
 */
export function setupNeonAuthRoutes(app: Express) {
  // Proxy all auth requests to the Neon Auth service
  app.all("/api/auth/*", async (req: Request, res: Response) => {
    if (!NEON_AUTH_URL) {
      return res.status(502).json({ error: "Auth service not configured" });
    }

    try {
      // Extract path after /api/auth/ and forward to Neon Auth
      // Client sends: /api/auth/sign-in/email
      // Neon Auth expects: {BASE_URL}/sign-in/email
      const subPath = req.path.replace(/^\/api\/auth\/?/, "");
      const targetUrl = `${NEON_AUTH_URL}/${subPath}`;

      const webRequest = new Request(targetUrl, {
        method: req.method,
        headers: (() => {
          const h = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value !== undefined && key !== "host") {
              h.set(key, Array.isArray(value) ? value.join(", ") : String(value));
            }
          }
          // Override origin to point to Neon Auth
          h.set("origin", NEON_AUTH_URL);
          return h;
        })(),
        body: ["POST", "PUT", "PATCH"].includes(req.method)
          ? typeof req.body === "string"
            ? req.body
            : JSON.stringify(req.body)
          : undefined,
      });

      const webResponse = await fetch(webRequest);

      // Copy response to Express
      applyWebResponseToExpress(webResponse as any, res);

      const body = await webResponse.text();
      res.send(body);
    } catch (error: any) {
      console.error("[auth] Proxy error:", error.message);
      res.status(502).json({ error: "Auth service unavailable" });
    }
  });
}
