CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

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

