const express = require('express');
const { pool } = require('../db');
const { computeAutoStatus } = require('./matching');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

function effectiveStatus(entry) {
  return entry.manual_status || entry.auto_status;
}

router.get('/', requireLogin, async (req, res) => {
  const result = await pool.query('SELECT * FROM entries ORDER BY created_at DESC');
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

  res.render('dashboard', {
    user: req.session.user,
    stats,
    total,
    matchRate,
    totalReq,
    totalRecv,
    diff: totalReq - totalRecv
  });
});

router.get('/entries', requireLogin, async (req, res) => {
  const result = await pool.query(
    `SELECT entries.*, users.name AS creator_name
     FROM entries LEFT JOIN users ON entries.user_id = users.id
     ORDER BY entries.created_at DESC`
  );
  const entries = result.rows.map((e) => ({ ...e, status: effectiveStatus(e) }));
  res.render('entries', { user: req.session.user, entries });
});

router.get('/entries/new', requireLogin, (req, res) => {
  res.render('new-entry', { user: req.session.user, entry: {}, error: null, editing: false });
});

router.post('/entries/new', requireLogin, async (req, res) => {
  const b = req.body;
  const auto_status = computeAutoStatus({
    item_name: b.item_name,
    gatepass_item_name: b.gatepass_item_name,
    req_qty: b.req_qty,
    received_qty: b.received_qty
  });

  try {
    await pool.query(
      `INSERT INTO entries
        (user_id, item_name, req_no, req_date, description, req_qty, unit,
         gatepass_no, gatepass_date, gatepass_item_name, received_qty, received_date, sender_name,
         auto_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
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
        auto_status
      ]
    );
    res.redirect('/entries');
  } catch (err) {
    console.error(err);
    res.render('new-entry', { user: req.session.user, entry: b, error: 'সেভ করা যায়নি, আবার চেষ্টা করুন।', editing: false });
  }
});

router.get('/entries/:id/edit', requireLogin, async (req, res) => {
  const result = await pool.query('SELECT * FROM entries WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.redirect('/entries');
  res.render('new-entry', { user: req.session.user, entry: result.rows[0], error: null, editing: true });
});

router.post('/entries/:id/edit', requireLogin, async (req, res) => {
  const b = req.body;
  const auto_status = computeAutoStatus({
    item_name: b.item_name,
    gatepass_item_name: b.gatepass_item_name,
    req_qty: b.req_qty,
    received_qty: b.received_qty
  });

  try {
    await pool.query(
      `UPDATE entries SET
        item_name=$1, req_no=$2, req_date=$3, description=$4, req_qty=$5, unit=$6,
        gatepass_no=$7, gatepass_date=$8, gatepass_item_name=$9, received_qty=$10,
        received_date=$11, sender_name=$12, auto_status=$13, updated_at=NOW()
       WHERE id=$14`,
      [
        b.item_name, b.req_no || null, b.req_date || null, b.description || null,
        b.req_qty || 0, b.unit || null, b.gatepass_no || null, b.gatepass_date || null,
        b.gatepass_item_name || null, b.received_qty || 0, b.received_date || null,
        b.sender_name || null, auto_status, req.params.id
      ]
    );
    res.redirect('/entries');
  } catch (err) {
    console.error(err);
    res.render('new-entry', { user: req.session.user, entry: { ...b, id: req.params.id }, error: 'আপডেট করা যায়নি।', editing: true });
  }
});

router.post('/entries/:id/status', requireLogin, async (req, res) => {
  const { manual_status, status_note } = req.body;
  const value = manual_status === 'auto' ? null : manual_status;
  await pool.query(
    'UPDATE entries SET manual_status = $1, status_note = $2, updated_at = NOW() WHERE id = $3',
    [value, status_note || null, req.params.id]
  );
  res.redirect('/entries');
});

router.post('/entries/:id/delete', requireLogin, async (req, res) => {
  await pool.query('DELETE FROM entries WHERE id = $1', [req.params.id]);
  res.redirect('/entries');
});

module.exports = router;
