const crypto = require('crypto');

// Simple session-bound CSRF protection (synchronizer token pattern).
// A token is generated once per session and exposed to every view as
// `csrfToken`. Every state-changing request (POST/PUT/PATCH/DELETE) must
// echo that token back in a `_csrf` field; otherwise it's rejected.
//
// Multipart (file-upload) requests are a special case: express.urlencoded
// hasn't parsed their body by the time this runs, so `attachCsrfToken` sets
// up the token as usual but `verifyCsrfToken` skips them — those routes
// call `checkCsrf` themselves, after multer has parsed the form fields.

function ensureToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}

function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function attachCsrfToken(req, res, next) {
  res.locals.csrfToken = ensureToken(req);
  next();
}

function checkCsrf(req, res, next) {
  const sessionToken = req.session && req.session.csrfToken;
  const submitted = req.body && req.body._csrf;
  if (!sessionToken || !submitted || !safeCompare(sessionToken, submitted)) {
    return res.status(403).render('error', {
      user: req.session.user || null,
      activeNav: '',
      message: 'ফর্মের মেয়াদ শেষ হয়ে গেছে বা যাচাই ব্যর্থ হয়েছে। পেজ রিফ্রেশ করে আবার চেষ্টা করুন।'
    });
  }
  next();
}

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function verifyCsrfToken(req, res, next) {
  if (!STATE_CHANGING_METHODS.has(req.method)) return next();
  // Multipart bodies aren't parsed yet here — those routes call checkCsrf
  // explicitly after their multer middleware runs.
  if (req.is('multipart/form-data')) return next();
  return checkCsrf(req, res, next);
}

module.exports = { attachCsrfToken, verifyCsrfToken, checkCsrf };
