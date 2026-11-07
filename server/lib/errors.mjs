// Error types shared by every route. Responses use the contract shape
// {"error":{"code":"…","message":"…"}}.

export class ApiError extends Error {
  constructor(status, code, message, detail) {
    super(message);
    this.status = status;
    this.code = code;
    // Short, non-sensitive reason for the server log only. Never sent to clients.
    if (detail) this.detail = detail;
  }
}

export const invalid = (message) => new ApiError(400, "INVALID_INPUT", message);
export const analysisFailed = (message, detail) => new ApiError(502, "ANALYSIS_FAILED", message, detail);
export const keyMissing = () =>
  new ApiError(503, "API_KEY_MISSING", "The analysis service is not configured on the server.");

// Thrown by shape validators. Callers map it to 400 (input) or 502 (model output).
export class ShapeError extends Error {}
