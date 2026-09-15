require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');

const { pool, initDb, closeDb } = require('./db');
const { attachCsrfToken, verifyCsrfToken } = require('./middleware/csrf');
const authRoutes = require('./routes/auth');
const entryRoutes = require('./routes/entries');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.SESSION_SECRET) {
  // Fail loudly rather than silently signing sessions with a well-known
  // default secret in production.
  console.error('SESSION_SECRET পরিবেশ ভেরিয়েবল সেট করা নেই। প্রোডাকশনে এটি ছাড়া সার্ভার চালু করা হবে না।');
  process.exit(1);
}

// Render (and most PaaS) terminate TLS at a proxy in front of the app, so
// Express needs to trust the X-Forwarded-* headers to know the original
// request was HTTPS — otherwise secure cookies and req.secure never work.
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(compression());

// A fresh nonce per request, used to allow only our own inline <script>
// (the dashboard trend chart) under a strict Content-Security-Policy.
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdnjs.cloudflare.com', (req, res) => `'nonce-${res.locals.cspNonce}'`],
        // Existing views rely on inline `style="..."` attributes; tightening
        // this further would mean moving every one of those into style.css.
        styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"]
      }
    }
  })
);

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    store: new pgSession({ pool, tableName: 'it_session', createTableIfMissing: false }),
    secret: process.env.SESSION_SECRET || 'change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      // 'auto' marks the cookie secure when the request is HTTPS (works
      // correctly now that 'trust proxy' is set above) and falls back to
      // plain HTTP for local development.
      secure: 'auto',
      httpOnly: true,
      sameSite: 'lax'
    }
  })
);

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

app.use(attachCsrfToken);
app.use(verifyCsrfToken);

// Unauthenticated liveness check for Render / uptime monitors — no session
// or DB round-trip required.
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/', authRoutes);
app.use('/', entryRoutes);
app.use('/', adminRoutes);

// ---------- 404 ----------
app.use((req, res) => {
  res.status(404).render('error', {
    user: req.session.user || null,
    activeNav: '',
    message: 'পেজটি খুঁজে পাওয়া যায়নি।'
  });
});

// ---------- Centralized error handler ----------
// Anything passed to next(err) — including rejected promises from
// asyncHandler-wrapped routes — ends up here instead of crashing the
// process or leaking a stack trace to the user.
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).render('error', {
    user: req.session.user || null,
    activeNav: '',
    message: 'একটা সমস্যা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।'
  });
});

let server;

async function start() {
  try {
    await initDb();
    server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

async function shutdown(signal) {
  console.log(`${signal} পেয়েছি, সার্ভার বন্ধ করা হচ্ছে...`);
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await closeDb();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
