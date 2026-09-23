import "dotenv/config";
import express, { type Request, type Response } from "express";
import { registerRoutes } from "../server/routes.js";

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

// Ensure /api prefix matches registered routes in server/routes
app.use((req, _res, next) => {
  const original = (req as any).originalUrl || req.url || "";
  if (original.startsWith("/api")) {
    req.url = original;
  } else if (!req.url.startsWith("/api")) {
    req.url = "/api" + req.url;
  }
  next();
});

let routesRegistered = false;

async function setup() {
  if (!routesRegistered) {
    await registerRoutes(app);
    routesRegistered = true;
  }
}

export default async function handler(req: Request, res: Response) {
  try {
    await setup();
    return app(req, res);
  } catch (err: any) {
    console.error("Serverless handler error:", err);
    return res.status(500).json({ error: "Internal Server Error", message: err?.message });
  }
}
