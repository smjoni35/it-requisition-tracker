// প্রথম admin তৈরি (বা বিদ্যমান অ্যাকাউন্টকে admin ও নতুন পাসওয়ার্ড দেওয়ার) স্ক্রিপ্ট
// ব্যবহার: node create-admin.js "নাম" ইমেইল পাসওয়ার্ড
// উদাহরণ: DATABASE_URL="<External URL>" node create-admin.js "Admin" admin@example.com MyStrongPass123

require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool, initDb, closeDb } = require('./db');

(async () => {
  const [, , name, email, password] = process.argv;

  if (!name || !email || !password) {
    console.error('ব্যবহার: node create-admin.js "নাম" ইমেইল পাসওয়ার্ড');
    process.exit(1);
  }
  if (password.length < 6) {
    console.error('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।');
    process.exit(1);
  }

  await initDb(); // টেবিল না থাকলে তৈরি করে নেয়
  const hash = await bcrypt.hash(password, 10);

  await pool.query(
    `INSERT INTO it_users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email)
     DO UPDATE SET name = $1, password_hash = $3, role = 'admin'`,
    [name, email.toLowerCase(), hash]
  );

  console.log(`Admin তৈরি হয়েছে: ${name} (${email.toLowerCase()})`);
  await closeDb();
})().catch((err) => {
  console.error('সমস্যা হয়েছে:', err.message);
  process.exit(1);
});
