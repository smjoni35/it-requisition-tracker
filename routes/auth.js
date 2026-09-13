const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../db');

const router = express.Router();

router.get('/register', (req, res) => {
  res.render('register', { error: null, name: '', email: '' });
});

router.post('/register', async (req, res) => {
  const { name, email, password, confirm } = req.body;

  if (!name || !email || !password) {
    return res.render('register', { error: 'সব ঘর পূরণ করুন।', name, email });
  }
  if (password !== confirm) {
    return res.render('register', { error: 'পাসওয়ার্ড মিলছে না।', name, email });
  }

  try {
    const existing = await pool.query('SELECT id FROM it_users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.render('register', { error: 'এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট আছে।', name, email });
    }

    const hash = await bcrypt.hash(password, 10);
    const userCount = await pool.query('SELECT COUNT(*)::int AS c FROM it_users');
    const role = userCount.rows[0].c === 0 ? 'admin' : 'staff';

    const result = await pool.query(
      'INSERT INTO it_users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [name, email.toLowerCase(), hash, role]
    );

    req.session.user = result.rows[0];
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.render('register', { error: 'কিছু একটা ভুল হয়েছে, আবার চেষ্টা করুন।', name, email });
  }
});

router.get('/login', (req, res) => {
  res.render('login', { error: null, email: '' });
});

router.post('/login', async (req, res) => {
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
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
