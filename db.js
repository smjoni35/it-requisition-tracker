const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

// Without this, an error on an *idle* client (e.g. the DB restarting, or a
// network blip) is an unhandled 'error' event and takes the whole Node
// process down. Logging it here keeps the pool alive so pg can recover the
// connection on the next query instead.
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

async function initDb() {
  const fs = require('fs');
  const path = require('path');
  const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);
}

async function closeDb() {
  await pool.end();
}

module.exports = { pool, initDb, closeDb };
