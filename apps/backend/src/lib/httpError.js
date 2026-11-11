// Thrown inside a database transaction to stop it and answer with this status.
// The transaction rolls back, so nothing half-done is kept.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Sends an HttpError as its JSON answer; anything else is rethrown for the
// 500 handler.
export function sendHttpError(res, err) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  throw err;
}
