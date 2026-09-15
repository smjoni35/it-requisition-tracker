// পাসওয়ার্ড রিসেট স্ক্রিপ্ট
// ব্যবহার: node reset-password.js <email> <new-password>
// উদাহরণ: node reset-password.js smjoni35@gmail.com MyNewPass123

require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool, closeDb } = require('./db');

async function resetPassword(email, newPassword) {
  if (!email || !newPassword) {
    console.error('ব্যবহার: node reset-password.js <email> <new-password>');
    process.exit(1);
  }
  if (newPassword.length < 6) {
    console.error('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।');
    process.exit(1);
  }

  const hash = await bcrypt.hash(newPassword, 10);
  const result = await pool.query(
    'UPDATE it_users SET password_hash = $1 WHERE email = $2 RETURNING id, name, email',
    [hash, email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    console.error(`কোনো অ্যাকাউন্ট পাওয়া যায়নি এই ইমেইল দিয়ে: ${email}`);
  } else {
    console.log(`পাসওয়ার্ড সফলভাবে বদলানো হয়েছে: ${result.rows[0].name} (${result.rows[0].email})`);
  }

  await closeDb();
}

const [, , email, newPassword] = process.argv;
resetPassword(email, newPassword).catch((err) => {
  console.error('সমস্যা হয়েছে:', err.message);
  process.exit(1);
});
