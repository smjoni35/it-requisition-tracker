// Wraps an async Express route handler so a rejected promise (e.g. a failed
// DB query) is forwarded to next(err) instead of crashing the process with
// an unhandled rejection.
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
