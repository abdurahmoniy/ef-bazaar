/** Error envelope produced by every backend service's @ControllerAdvice. */
export interface ApiError {
  status: number;
  error: string;
  message: string;
  code?: string;
  /** Populated when the backend is running with APP_DEBUG_ERRORS=true. */
  details?: unknown;
}
