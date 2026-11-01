import "dotenv/config";

export const ENV = {
  PORT: process.env.PORT || 5001,
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV || "development",
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret-change-in-prod",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "12h",
  API_URL: process.env.API_URL,
  // Comma-separated list of allowed browser origins. Unset = allow all (dev).
  CORS_ORIGIN: process.env.CORS_ORIGIN,
};

// Fail fast on missing critical config (except in test, which sets its own).
if (!ENV.DATABASE_URL) {
  console.warn("WARNING: DATABASE_URL is not set.");
}
if (ENV.NODE_ENV === "production" && ENV.JWT_SECRET === "dev-secret-change-in-prod") {
  throw new Error("JWT_SECRET must be set to a strong secret in production.");
}
