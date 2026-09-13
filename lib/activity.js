const { pool } = require('../db');

// Writes one row to it_activity_log. item_name/req_no are copied in so the
// history stays readable even if the entry itself is later edited or deleted.
async function logActivity({ entryId, user, action, itemName, reqNo, fromStatus, toStatus, note }) {
  try {
    await pool.query(
      `INSERT INTO it_activity_log
        (entry_id, user_id, user_name, action, item_name, req_no, from_status, to_status, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        entryId || null,
        user ? user.id : null,
        user ? user.name : null,
        action,
        itemName || null,
        reqNo || null,
        fromStatus || null,
        toStatus || null,
        note || null
      ]
    );
  } catch (err) {
    // Activity logging must never break the actual entry operation.
    console.error('Activity log write failed:', err);
  }
}

module.exports = { logActivity };
