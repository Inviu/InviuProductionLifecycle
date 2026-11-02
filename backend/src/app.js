import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { sql } from "drizzle-orm";
import { db } from "./config/db.js";
import { ENV } from "./config/env.js";
import { notFound, errorHandler } from "./middleware/validate.js";
import authRoutes from "./routes/auth.routes.js";
import masterRoutes from "./routes/master.routes.js";
import workOrderRoutes from "./routes/workOrders.routes.js";
import operatorRoutes from "./routes/operator.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import reportRoutes from "./routes/reports.routes.js";
import productionRoutes from "./routes/production.routes.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  // Restrict CORS to configured origins in production; allow all when unset (dev).
  const corsOrigins = ENV.CORS_ORIGIN
    ? ENV.CORS_ORIGIN.split(",").map((o) => o.trim())
    : true;
  app.use(cors({ origin: corsOrigins }));
  app.use(express.json());
  if (ENV.NODE_ENV !== "test") app.use(morgan("tiny"));

  // Liveness and DB readiness probes (for load balancers / deploy platforms).
  app.get("/api/health", (req, res) => res.status(200).json({ status: "true" }));
  app.get("/api/health/db", async (req, res) => {
    try {
      await db.execute(sql`select 1`);
      res.json({ status: "ok", db: "up" });
    } catch {
      res.status(503).json({ status: "error", db: "down" });
    }
  });

  // Throttle auth to blunt brute-force attempts.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many attempts, please try again later" },
  });
  app.use("/api/auth/login", authLimiter);

  app.use("/api/auth", authRoutes);
  app.use("/api", masterRoutes);
  app.use("/api/work-orders", workOrderRoutes);
  app.use("/api/operator", operatorRoutes);
  app.use("/api/audit", auditRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/production-entries", productionRoutes);

  app.use("/api", notFound);
  app.use(errorHandler);
  return app;
}
