CREATE TABLE IF NOT EXISTS it_users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS it_entries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES it_users(id) ON DELETE SET NULL,

  -- Requisition side
  item_name TEXT NOT NULL,
  req_no TEXT,
  req_date DATE,
  description TEXT,
  req_qty NUMERIC DEFAULT 0,
  unit TEXT,

  -- Gate pass side
  gatepass_no TEXT,
  gatepass_date DATE,
  gatepass_item_name TEXT,
  received_qty NUMERIC DEFAULT 0,
  received_date DATE,
  sender_name TEXT,

  -- Matching
  auto_status TEXT NOT NULL DEFAULT 'pending',
  manual_status TEXT,
  status_note TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Session store table (created here instead of by connect-pg-simple).
-- connect-pg-simple always names the primary-key constraint "session_pkey"
-- no matter what tableName you give it, so if another app/table on this
-- same database already has a constraint called "session_pkey", every
-- deploy fails with: error: relation "session_pkey" already exists.
-- Creating the table ourselves with a uniquely-named constraint avoids that.
CREATE TABLE IF NOT EXISTS it_session (
  sid varchar NOT NULL COLLATE "default",
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
) WITH (OIDS=FALSE);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'it_session_pkey'
  ) THEN
    ALTER TABLE it_session
      ADD CONSTRAINT it_session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IDX_it_session_expire" ON it_session (expire);

