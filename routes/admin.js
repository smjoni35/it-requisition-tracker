const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { asyncHandler } = require('../lib/async-handler');
const { requireLogin, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// অ্যাডমিন ছাড়া কেউ এই রুটগুলোর ধারেকাছেও যেতে পারবে না।
router.use(requireLogin, requireAdmin);

router.get('/admin/users', asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT id, name, email, role, created_at FROM it_users ORDER BY created_at ASC'
  );
  res.render('admin-users', {
    user: req.session.user,
    activeNav: 'profile',
    users: result.rows,
    error: null,
    success: null
  });
}));

router.post('/admin/users/:id/password', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { new_password, confirm_password } = req.body;

  const result = await pool.query(
    'SELECT id, name, email, role, created_at FROM it_users ORDER BY created_at ASC'
  );
  const users = result.rows;

  if (!new_password || !confirm_password) {
    return res.render('admin-users', { user: req.session.user, activeNav: 'profile', users, error: 'সব ঘর পূরণ করুন।', success: null });
  }
  if (new_password !== confirm_password) {
    return res.render('admin-users', { user: req.session.user, activeNav: 'profile', users, error: 'পাসওয়ার্ড মিলছে না।', success: null });
  }
  if (new_password.length < 6) {
    return res.render('admin-users', { user: req.session.user, activeNav: 'profile', users, error: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।', success: null });
  }

  const target = users.find((u) => String(u.id) === String(id));
  if (!target) {
    return res.render('admin-users', { user: req.session.user, activeNav: 'profile', users, error: 'ব্যবহারকারী পাওয়া যায়নি।', success: null });
  }

  const hash = await bcrypt.hash(new_password, 10);
  await pool.query('UPDATE it_users SET password_hash = $1 WHERE id = $2', [hash, id]);

  res.render('admin-users', {
    user: req.session.user,
    activeNav: 'profile',
    users,
    error: null,
    success: `${target.name} (${target.email}) এর পাসওয়ার্ড বদলানো হয়েছে।`
  });
}));

module.exports = router;
