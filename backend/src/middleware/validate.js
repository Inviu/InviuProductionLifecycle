// Small helpers: async route wrapper, zod body validation, 404 + error handler.

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Validate req.body against a zod schema; replaces req.body with parsed data.
export const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }
  req.body = result.data;
  next();
};

export const notFound = (req, res) =>
  res.status(404).json({ error: "Not found" });

// Central error handler. AppError carries an explicit status; everything else is 500.
export const errorHandler = (err, req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error("Unhandled error:", err);
  res.status(status).json({
    error: err.expose || status < 500 ? err.message : "Internal server error",
  });
};

export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}
