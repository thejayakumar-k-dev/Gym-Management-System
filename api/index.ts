import express from "express";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS headers
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Normalize request URL for /api prefix
app.use((req, _res, next) => {
  const matched = (req.headers["x-matched-path"] as string) || "";
  const rawUrl = (req as any).originalUrl || req.url || "";
  const candidate = matched.startsWith("/api") ? matched : rawUrl;

  if (candidate.startsWith("/api")) {
    req.url = candidate;
  } else if (!req.url.startsWith("/api")) {
    req.url = "/api" + req.url;
  }
  next();
});

// Immediate health check route
app.get("/api/health", (_req, res) => {
  return res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    env: {
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL),
      hasFirebaseServiceAccount: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || process.env.FIREBASE_SERVICE_ACCOUNT_KEY),
      hasEncryptionKey: Boolean(process.env.VENDOR_CONFIG_ENCRYPTION_KEY),
      hasNeonApiKey: Boolean(process.env.NEON_API_KEY),
      nodeEnv: process.env.NODE_ENV,
      vercel: process.env.VERCEL,
    },
  });
});

let routesRegistered = false;
let routeRegisterError: any = null;

async function setup() {
  if (routesRegistered) return;
  try {
    const { registerRoutes } = await import("../server/routes.js");
    await registerRoutes(app);
    routesRegistered = true;
  } catch (err: any) {
    routeRegisterError = err;
    console.error("Failed to register routes:", err);
    throw err;
  }
}

export default async function handler(req: any, res: any) {
  try {
    const rawUrl = (req as any).originalUrl || req.url || "";
    const matched = (req.headers["x-matched-path"] as string) || "";
    const isHealthCheck = rawUrl.includes("/api/health") || matched.includes("/api/health");

    if (!isHealthCheck) {
      await setup();
    }

    return new Promise((resolve, reject) => {
      app(req, res, (err: any) => {
        if (err) return reject(err);
        resolve(undefined);
      });
      res.on("finish", resolve);
      res.on("close", resolve);
    });
  } catch (err: any) {
    console.error("Serverless handler error:", err);
    return res.status(500).json({
      error: "Internal Server Error",
      message: err?.message || String(err),
      stack: err?.stack,
      routeRegisterError: routeRegisterError ? String(routeRegisterError?.stack || routeRegisterError) : null,
    });
  }
}
