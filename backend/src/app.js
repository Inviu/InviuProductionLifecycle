import express from "express";
import cors from "cors";
import { notFound, errorHandler } from "./middleware/validate.js";
import authRoutes from "./routes/auth.routes.js";
import masterRoutes from "./routes/master.routes.js";
import workOrderRoutes from "./routes/workOrders.routes.js";
import operatorRoutes from "./routes/operator.routes.js";
import auditRoutes from "./routes/audit.routes.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (req, res) => res.status(200).json({ status: "true" }));

  app.use("/api/auth", authRoutes);
  app.use("/api", masterRoutes);
  app.use("/api/work-orders", workOrderRoutes);
  app.use("/api/operator", operatorRoutes);
  app.use("/api/audit", auditRoutes);

  app.use("/api", notFound);
  app.use(errorHandler);
  return app;
}
