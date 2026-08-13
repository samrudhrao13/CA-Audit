/**
 * Wraps an async Express handler/middleware so a rejected promise is passed
 * to next(err) instead of becoming an unhandled rejection that crashes the
 * whole process. Express 4 doesn't do this automatically for async
 * functions — every async route/middleware in this app goes through this.
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
