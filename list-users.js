// সব ইউজার আর তাদের রোল (admin/staff) দেখার স্ক্রিপ্ট
// ব্যবহার: node list-users.js

require('dotenv').config();
const { pool, closeDb } = require('./db');

async function listUsers() {
  const result = await pool.query(
    'SELECT id, name, email, role, created_at FROM it_users ORDER BY created_at ASC'
  );

  if (result.rows.length === 0) {
    console.log('কোনো ইউজার পাওয়া যায়নি।');
  } else {
    console.log('আইডি | নাম | ইমেইল | রোল | তৈরি হয়েছে');
    result.rows.forEach((u) => {
      console.log(`${u.id} | ${u.name} | ${u.email} | ${u.role} | ${u.created_at}`);
    });
  }

  await closeDb();
}

listUsers().catch((err) => {
  console.error('সমস্যা হয়েছে:', err.message);
  process.exit(1);
});
