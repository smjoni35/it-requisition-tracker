const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { pool } = require('../db');
const { computeAutoStatus } = require('./matching');
const { requireLogin, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../lib/activity');

const router = express.Router();

const PAGE_SIZE = 10;
const STATUS_LABELS = { matched: 'মিলেছে', mismatched: 'মিলেনি', partial: 'আংশিক', pending: 'অপেক্ষমান' };

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB — kept small since it's stored as base64 in the DB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('শুধু ছবি ফাইল আপলোড করা যাবে।'));
    cb(null, true);
  }
});

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }
});

function effectiveStatus(entry) {
  return entry.manual_status || entry.auto_status;
}

// Builds a shared WHERE clause for search (q) + status filter, used by the
// list page, the print report, and the Excel export so all three agree.
function buildFilter(query) {
  const clauses = [];
  const params = [];
  if (query.q && query.q.trim()) {
    params.push(`%${query.q.trim()}%`);
    const idx = params.length;
    clauses.push(
      `(it_entries.item_name ILIKE $${idx} OR it_entries.req_no ILIKE $${idx} OR it_entries.gatepass_no ILIKE $${idx} OR it_entries.gatepass_item_name ILIKE $${idx})`
    );
  }
  if (query.status && query.status !== 'all') {
    params.push(query.status);
    clauses.push(`COALESCE(it_entries.manual_status, it_entries.auto_status) = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return { where, params };
}

async function fetchFilteredEntries(query, { limit, offset } = {}) {
  const { where, params } = buildFilter(query);
  let sql = `SELECT it_entries.*, it_users.name AS creator_name
     FROM it_entries LEFT JOIN it_users ON it_entries.user_id = it_users.id
     ${where}
     ORDER BY it_entries.created_at DESC`;
  const finalParams = [...params];
  if (limit !== undefined) {
    finalParams.push(limit);
    sql += ` LIMIT $${finalParams.length}`;
    finalParams.push(offset || 0);
    sql += ` OFFSET $${finalParams.length}`;
  }
  const result = await pool.query(sql, finalParams);
  return result.rows.map((e) => ({ ...e, status: effectiveStatus(e) }));
}

// ---------- Dashboard ----------

router.get('/', requireLogin, async (req, res) => {
  const result = await pool.query('SELECT * FROM it_entries ORDER BY created_at DESC');
  const entries = result.rows;

  const stats = { matched: 0, mismatched: 0, partial: 0, pending: 0 };
  let totalReq = 0;
  let totalRecv = 0;

  entries.forEach((e) => {
    const status = effectiveStatus(e);
    if (stats[status] !== undefined) stats[status] += 1;
    totalReq += Number(e.req_qty) || 0;
    totalRecv += Number(e.received_qty) || 0;
  });

  const total = entries.length;
  const matchRate = total > 0 ? Math.round((stats.matched / total) * 100) : 0;

  const trendResult = await pool.query(`
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
      COUNT(e.id) FILTER (WHERE e.id IS NOT NULL)::int AS total,
      COUNT(e.id) FILTER (WHERE COALESCE(e.manual_status, e.auto_status) = 'matched')::int AS matched
    FROM generate_series(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, INTERVAL '1 day') AS d(day)
    LEFT JOIN it_entries e ON DATE(e.created_at) = d.day
    GROUP BY d.day
    ORDER BY d.day
  `);

  res.render('dashboard', {
    user: req.session.user,
    activeNav: 'dashboard',
    stats,
    total,
    matchRate,
    totalReq,
    totalRecv,
    diff: totalReq - totalRecv,
    trend: trendResult.rows
  });
});

// ---------- Entries list (search + filter + pagination) ----------

router.get('/entries', requireLogin, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const { where, params } = buildFilter(req.query);

  const countResult = await pool.query(`SELECT COUNT(*)::int AS c FROM it_entries ${where}`, params);
  const totalCount = countResult.rows[0].c;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const entries = await fetchFilteredEntries(req.query, { limit: PAGE_SIZE, offset: (currentPage - 1) * PAGE_SIZE });

  res.render('entries', {
    user: req.session.user,
    activeNav: 'entries',
    entries,
    q: req.query.q || '',
    status: req.query.status || 'all',
    currentPage,
    totalPages,
    totalCount
  });
});

router.get('/entries/new', requireLogin, (req, res) => {
  res.render('new-entry', { user: req.session.user, activeNav: 'new', entry: {}, error: null, editing: false });
});

router.post('/entries/new', requireLogin, (req, res, next) => {
  imageUpload.single('image')(req, res, (err) => {
    if (err) return res.render('new-entry', { user: req.session.user, activeNav: 'new', entry: req.body, error: err.message, editing: false });
    next();
  });
}, async (req, res) => {
  const b = req.body;
  const auto_status = computeAutoStatus({
    item_name: b.item_name,
    gatepass_item_name: b.gatepass_item_name,
    req_qty: b.req_qty,
    received_qty: b.received_qty
  });

  const image_data = req.file ? req.file.buffer.toString('base64') : null;
  const image_mime = req.file ? req.file.mimetype : null;
  const image_filename = req.file ? req.file.originalname : null;

  try {
    const inserted = await pool.query(
      `INSERT INTO it_entries
        (user_id, item_name, req_no, req_date, description, req_qty, unit,
         gatepass_no, gatepass_date, gatepass_item_name, received_qty, received_date, sender_name,
         auto_status, image_data, image_mime, image_filename)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id`,
      [
        req.session.user.id,
        b.item_name,
        b.req_no || null,
        b.req_date || null,
        b.description || null,
        b.req_qty || 0,
        b.unit || null,
        b.gatepass_no || null,
        b.gatepass_date || null,
        b.gatepass_item_name || null,
        b.received_qty || 0,
        b.received_date || null,
        b.sender_name || null,
        auto_status,
        image_data,
        image_mime,
        image_filename
      ]
    );
    await logActivity({
      entryId: inserted.rows[0].id,
      user: req.session.user,
      action: 'created',
      itemName: b.item_name,
      reqNo: b.req_no,
      toStatus: auto_status
    });
    res.redirect('/entries');
  } catch (err) {
    console.error(err);
    res.render('new-entry', { user: req.session.user, activeNav: 'new', entry: b, error: 'সেভ করা যায়নি, আবার চেষ্টা করুন।', editing: false });
  }
});

router.get('/entries/:id/edit', requireLogin, async (req, res) => {
  const result = await pool.query('SELECT * FROM it_entries WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.redirect('/entries');
  res.render('new-entry', { user: req.session.user, activeNav: 'new', entry: result.rows[0], error: null, editing: true });
});

router.post('/entries/:id/edit', requireLogin, (req, res, next) => {
  imageUpload.single('image')(req, res, (err) => {
    if (err) return res.render('new-entry', { user: req.session.user, activeNav: 'new', entry: { ...req.body, id: req.params.id }, error: err.message, editing: true });
    next();
  });
}, async (req, res) => {
  const b = req.body;
  const auto_status = computeAutoStatus({
    item_name: b.item_name,
    gatepass_item_name: b.gatepass_item_name,
    req_qty: b.req_qty,
    received_qty: b.received_qty
  });

  try {
    const existing = await pool.query('SELECT image_data, image_mime, image_filename FROM it_entries WHERE id = $1', [req.params.id]);
    let image_data = existing.rows[0] ? existing.rows[0].image_data : null;
    let image_mime = existing.rows[0] ? existing.rows[0].image_mime : null;
    let image_filename = existing.rows[0] ? existing.rows[0].image_filename : null;

    if (req.file) {
      image_data = req.file.buffer.toString('base64');
      image_mime = req.file.mimetype;
      image_filename = req.file.originalname;
    } else if (b.remove_image === 'on') {
      image_data = null;
      image_mime = null;
      image_filename = null;
    }

    await pool.query(
      `UPDATE it_entries SET
        item_name=$1, req_no=$2, req_date=$3, description=$4, req_qty=$5, unit=$6,
        gatepass_no=$7, gatepass_date=$8, gatepass_item_name=$9, received_qty=$10,
        received_date=$11, sender_name=$12, auto_status=$13, image_data=$14, image_mime=$15,
        image_filename=$16, updated_at=NOW()
       WHERE id=$17`,
      [
        b.item_name, b.req_no || null, b.req_date || null, b.description || null,
        b.req_qty || 0, b.unit || null, b.gatepass_no || null, b.gatepass_date || null,
        b.gatepass_item_name || null, b.received_qty || 0, b.received_date || null,
        b.sender_name || null, auto_status, image_data, image_mime, image_filename, req.params.id
      ]
    );
    await logActivity({
      entryId: req.params.id,
      user: req.session.user,
      action: 'updated',
      itemName: b.item_name,
      reqNo: b.req_no,
      toStatus: auto_status
    });
    res.redirect('/entries');
  } catch (err) {
    console.error(err);
    res.render('new-entry', { user: req.session.user, activeNav: 'new', entry: { ...b, id: req.params.id }, error: 'আপডেট করা যায়নি।', editing: true });
  }
});

router.post('/entries/:id/status', requireLogin, async (req, res) => {
  const { manual_status, status_note } = req.body;
  const value = manual_status === 'auto' ? null : manual_status;

  const before = await pool.query('SELECT item_name, req_no, manual_status, auto_status FROM it_entries WHERE id = $1', [req.params.id]);
  const prev = before.rows[0];
  const fromStatus = prev ? effectiveStatus(prev) : null;
  const toStatus = value || (prev ? prev.auto_status : null);

  await pool.query(
    'UPDATE it_entries SET manual_status = $1, status_note = $2, updated_at = NOW() WHERE id = $3',
    [value, status_note || null, req.params.id]
  );

  if (prev) {
    await logActivity({
      entryId: req.params.id,
      user: req.session.user,
      action: 'status_changed',
      itemName: prev.item_name,
      reqNo: prev.req_no,
      fromStatus,
      toStatus,
      note: status_note || null
    });
  }
  res.redirect('/entries');
});

router.post('/entries/:id/delete', requireLogin, requireAdmin, async (req, res) => {
  const existing = await pool.query('SELECT item_name, req_no FROM it_entries WHERE id = $1', [req.params.id]);
  const prev = existing.rows[0];

  await pool.query('DELETE FROM it_entries WHERE id = $1', [req.params.id]);

  if (prev) {
    await logActivity({
      entryId: null,
      user: req.session.user,
      action: 'deleted',
      itemName: prev.item_name,
      reqNo: prev.req_no
    });
  }
  res.redirect('/entries');
});

// ---------- Proof image ----------

router.get('/entries/:id/image', requireLogin, async (req, res) => {
  const result = await pool.query('SELECT image_data, image_mime FROM it_entries WHERE id = $1', [req.params.id]);
  const row = result.rows[0];
  if (!row || !row.image_data) return res.status(404).send('ছবি নেই');
  res.set('Content-Type', row.image_mime || 'application/octet-stream');
  res.send(Buffer.from(row.image_data, 'base64'));
});

// ---------- Print-friendly report ----------

router.get('/entries/print', requireLogin, async (req, res) => {
  const entries = await fetchFilteredEntries(req.query);
  const stats = { matched: 0, mismatched: 0, partial: 0, pending: 0 };
  entries.forEach((e) => { if (stats[e.status] !== undefined) stats[e.status] += 1; });

  res.render('print-report', {
    user: req.session.user,
    entries,
    stats,
    total: entries.length,
    labels: STATUS_LABELS,
    q: req.query.q || '',
    status: req.query.status || 'all',
    generatedAt: new Date()
  });
});

// ---------- Excel export ----------

router.get('/entries/export/excel', requireLogin, async (req, res) => {
  const entries = await fetchFilteredEntries(req.query);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('এন্ট্রি');

  sheet.columns = [
    { header: 'আইটেম', key: 'item_name', width: 24 },
    { header: 'রিকুইজিশন নং', key: 'req_no', width: 16 },
    { header: 'রিকুইজিশন তারিখ', key: 'req_date', width: 14 },
    { header: 'চাহিদা', key: 'req_qty', width: 10 },
    { header: 'একক', key: 'unit', width: 8 },
    { header: 'গেট পাস নং', key: 'gatepass_no', width: 14 },
    { header: 'গেট পাস আইটেম', key: 'gatepass_item_name', width: 24 },
    { header: 'প্রাপ্ত', key: 'received_qty', width: 10 },
    { header: 'গ্রহণের তারিখ', key: 'received_date', width: 14 },
    { header: 'প্রেরণকারী', key: 'sender_name', width: 18 },
    { header: 'স্ট্যাটাস', key: 'status_label', width: 12 },
    { header: 'নোট', key: 'status_note', width: 20 },
    { header: 'যোগকারী', key: 'creator_name', width: 16 }
  ];
  sheet.getRow(1).font = { bold: true };

  entries.forEach((e) => {
    sheet.addRow({
      item_name: e.item_name,
      req_no: e.req_no || '',
      req_date: e.req_date ? new Date(e.req_date).toISOString().slice(0, 10) : '',
      req_qty: e.req_qty,
      unit: e.unit || '',
      gatepass_no: e.gatepass_no || '',
      gatepass_item_name: e.gatepass_item_name || '',
      received_qty: e.received_qty,
      received_date: e.received_date ? new Date(e.received_date).toISOString().slice(0, 10) : '',
      sender_name: e.sender_name || '',
      status_label: STATUS_LABELS[e.status] || e.status,
      status_note: e.status_note || '',
      creator_name: e.creator_name || ''
    });
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="entries-${Date.now()}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

// ---------- Activity log ----------

router.get('/activity', requireLogin, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 25;

  const countResult = await pool.query('SELECT COUNT(*)::int AS c FROM it_activity_log');
  const totalCount = countResult.rows[0].c;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const currentPage = Math.min(page, totalPages);

  const result = await pool.query(
    'SELECT * FROM it_activity_log ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, (currentPage - 1) * limit]
  );

  res.render('activity-log', {
    user: req.session.user,
    activeNav: '',
    logs: result.rows,
    labels: STATUS_LABELS,
    currentPage,
    totalPages
  });
});

// ---------- CSV bulk import ----------

// Minimal CSV parser that handles quoted fields containing commas/newlines.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const CSV_COLUMNS = [
  'item_name', 'req_no', 'req_date', 'description', 'req_qty', 'unit',
  'gatepass_no', 'gatepass_date', 'gatepass_item_name', 'received_qty', 'received_date', 'sender_name'
];

router.get('/entries/import', requireLogin, (req, res) => {
  res.render('import', { user: req.session.user, activeNav: '', error: null, result: null, columns: CSV_COLUMNS });
});

router.post('/entries/import', requireLogin, (req, res, next) => {
  csvUpload.single('csv_file')(req, res, (err) => {
    if (err) return res.render('import', { user: req.session.user, activeNav: '', error: err.message, result: null, columns: CSV_COLUMNS });
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.render('import', { user: req.session.user, activeNav: '', error: 'CSV ফাইল বাছাই করুন।', result: null, columns: CSV_COLUMNS });
  }

  const text = req.file.buffer.toString('utf8');
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return res.render('import', { user: req.session.user, activeNav: '', error: 'ফাইলে কোনো ডেটা পাওয়া যায়নি।', result: null, columns: CSV_COLUMNS });
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const dataRows = rows.slice(1);

  let inserted = 0;
  let failed = 0;

  for (const r of dataRows) {
    const record = {};
    header.forEach((colName, idx) => {
      if (CSV_COLUMNS.includes(colName)) record[colName] = (r[idx] || '').trim();
    });
    if (!record.item_name) { failed += 1; continue; }

    const auto_status = computeAutoStatus({
      item_name: record.item_name,
      gatepass_item_name: record.gatepass_item_name,
      req_qty: record.req_qty,
      received_qty: record.received_qty
    });

    try {
      const insertedRow = await pool.query(
        `INSERT INTO it_entries
          (user_id, item_name, req_no, req_date, description, req_qty, unit,
           gatepass_no, gatepass_date, gatepass_item_name, received_qty, received_date, sender_name, auto_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [
          req.session.user.id,
          record.item_name,
          record.req_no || null,
          record.req_date || null,
          record.description || null,
          record.req_qty || 0,
          record.unit || null,
          record.gatepass_no || null,
          record.gatepass_date || null,
          record.gatepass_item_name || null,
          record.received_qty || 0,
          record.received_date || null,
          record.sender_name || null,
          auto_status
        ]
      );
      inserted += 1;
      await logActivity({
        entryId: insertedRow.rows[0].id,
        user: req.session.user,
        action: 'imported',
        itemName: record.item_name,
        reqNo: record.req_no,
        toStatus: auto_status
      });
    } catch (err) {
      console.error('CSV row import failed:', err);
      failed += 1;
    }
  }

  res.render('import', {
    user: req.session.user,
    activeNav: '',
    error: null,
    result: { inserted, failed, total: dataRows.length },
    columns: CSV_COLUMNS
  });
});

// ---------- Profile ----------

router.get('/profile', requireLogin, (req, res) => {
  res.render('profile', { user: req.session.user, activeNav: 'profile', error: null, success: null });
});

router.post('/profile', requireLogin, async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) {
    return res.render('profile', { user: req.session.user, activeNav: 'profile', error: 'নাম খালি রাখা যাবে না।', success: null });
  }
  try {
    await pool.query('UPDATE it_users SET name = $1 WHERE id = $2', [name, req.session.user.id]);
    req.session.user.name = name;
    res.render('profile', { user: req.session.user, activeNav: 'profile', error: null, success: 'নাম আপডেট হয়েছে।' });
  } catch (err) {
    console.error(err);
    res.render('profile', { user: req.session.user, activeNav: 'profile', error: 'আপডেট করা যায়নি।', success: null });
  }
});

router.post('/profile/password', requireLogin, async (req, res) => {
  const bcrypt = require('bcrypt');
  const { current_password, new_password, confirm_password } = req.body;

  if (!current_password || !new_password || !confirm_password) {
    return res.render('profile', { user: req.session.user, activeNav: 'profile', error: 'সব ঘর পূরণ করুন।', success: null });
  }
  if (new_password !== confirm_password) {
    return res.render('profile', { user: req.session.user, activeNav: 'profile', error: 'নতুন পাসওয়ার্ড মিলছে না।', success: null });
  }
  if (new_password.length < 6) {
    return res.render('profile', { user: req.session.user, activeNav: 'profile', error: 'নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।', success: null });
  }

  try {
    const result = await pool.query('SELECT password_hash FROM it_users WHERE id = $1', [req.session.user.id]);
    const ok = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!ok) {
      return res.render('profile', { user: req.session.user, activeNav: 'profile', error: 'বর্তমান পাসওয়ার্ড ভুল।', success: null });
    }
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE it_users SET password_hash = $1 WHERE id = $2', [hash, req.session.user.id]);
    res.render('profile', { user: req.session.user, activeNav: 'profile', error: null, success: 'পাসওয়ার্ড পরিবর্তন হয়েছে।' });
  } catch (err) {
    console.error(err);
    res.render('profile', { user: req.session.user, activeNav: 'profile', error: 'পরিবর্তন করা যায়নি।', success: null });
  }
});

module.exports = router;
