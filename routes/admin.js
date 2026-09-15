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

router.post('/admin/users/:id/role', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  const result = await pool.query(
    'SELECT id, name, email, role, created_at FROM it_users ORDER BY created_at ASC'
  );
  const users = result.rows;

  if (!['admin', 'staff'].includes(role)) {
    return res.render('admin-users', { user: req.session.user, activeNav: 'profile', users, error: 'ভুল রোল।', success: null });
  }

  const target = users.find((u) => String(u.id) === String(id));
  if (!target) {
    return res.render('admin-users', { user: req.session.user, activeNav: 'profile', users, error: 'ব্যবহারকারী পাওয়া যায়নি।', success: null });
  }

  // নিজেকে staff বানাতে গেলে নিশ্চিত করি যে আরও অন্তত একজন admin থেকে যাচ্ছে,
  // যাতে ভুল করে পুরো প্রতিষ্ঠান কোনো অ্যাডমিন ছাড়া আটকে না যায়।
  if (String(target.id) === String(req.session.user.id) && role === 'staff') {
    const adminCount = users.filter((u) => u.role === 'admin').length;
    if (adminCount <= 1) {
      return res.render('admin-users', { user: req.session.user, activeNav: 'profile', users, error: 'আপনি একমাত্র অ্যাডমিন — আগে অন্য কাউকে অ্যাডমিন বানান, তারপর নিজেকে staff করুন।', success: null });
    }
  }

  await pool.query('UPDATE it_users SET role = $1 WHERE id = $2', [role, id]);

  const updatedUsers = await pool.query(
    'SELECT id, name, email, role, created_at FROM it_users ORDER BY created_at ASC'
  );

  res.render('admin-users', {
    user: req.session.user,
    activeNav: 'profile',
    users: updatedUsers.rows,
    error: null,
    success: `${target.name} (${target.email}) এখন ${role === 'admin' ? 'অ্যাডমিন' : 'স্টাফ'}।`
  });
}));

router.post('/admin/users/:id/delete', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    'SELECT id, name, email, role, created_at FROM it_users ORDER BY created_at ASC'
  );
  const users = result.rows;

  const target = users.find((u) => String(u.id) === String(id));
  if (!target) {
    return res.render('admin-users', { user: req.session.user, activeNav: 'profile', users, error: 'ব্যবহারকারী পাওয়া যায়নি।', success: null });
  }

  if (target.role === 'admin') {
    const adminCount = users.filter((u) => u.role === 'admin').length;
    if (adminCount <= 1) {
      return res.render('admin-users', { user: req.session.user, activeNav: 'profile', users, error: 'একমাত্র অ্যাডমিনকে মুছে ফেলা যাবে না।', success: null });
    }
  }

  await pool.query('DELETE FROM it_users WHERE id = $1', [id]);

  const updatedUsers = await pool.query(
    'SELECT id, name, email, role, created_at FROM it_users ORDER BY created_at ASC'
  );

  const wasSelf = String(target.id) === String(req.session.user.id);
  if (wasSelf) {
    return req.session.destroy(() => res.redirect('/login'));
  }

  res.render('admin-users', {
    user: req.session.user,
    activeNav: 'profile',
    users: updatedUsers.rows,
    error: null,
    success: `${target.name} (${target.email}) মুছে ফেলা হয়েছে।`
  });
}));

module.exports = router;
