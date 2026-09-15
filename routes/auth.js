const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { asyncHandler } = require('../lib/async-handler');

const router = express.Router();

// Slows down credential-stuffing / brute-force attempts against login and
// registration. Keyed by IP (via req.ip, which respects 'trust proxy').
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).render('error', {
      user: null,
      activeNav: '',
      message: 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।'
    });
  }
});

// রেজিস্ট্রেশন বন্ধ — এখন থেকে নতুন স্টাফ শুধু অ্যাডমিন প্যানেল
// (/admin/users) থেকেই যোগ করা যাবে, কেউ নিজে নিজে অ্যাকাউন্ট
// খুলতে পারবে না।
router.get('/register', (req, res) => {
  res.redirect('/login');
});

router.post('/register', (req, res) => {
  res.redirect('/login');
});

router.get('/login', (req, res) => {
  res.render('login', { error: null, email: '' });
});

router.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM it_users WHERE email = $1', [(email || '').toLowerCase()]);
    const user = result.rows[0];

    if (!user) {
      return res.render('login', { error: 'ইমেইল বা পাসওয়ার্ড ভুল।', email });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.render('login', { error: 'ইমেইল বা পাসওয়ার্ড ভুল।', email });
    }

    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.render('login', { error: 'কিছু একটা ভুল হয়েছে, আবার চেষ্টা করুন।', email });
  }
}));

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
