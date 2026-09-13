// Compares requisition side vs gate-pass side and returns an auto status.
// Statuses: 'pending' | 'matched' | 'partial' | 'mismatched'

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0980-\u09ff\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameSimilarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;

  const wordsA = new Set(na.split(' '));
  const wordsB = new Set(nb.split(' '));
  const shared = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : shared / union;
}

function computeAutoStatus(entry) {
  const hasGatePassData =
    entry.gatepass_no || entry.gatepass_item_name || Number(entry.received_qty) > 0;

  if (!hasGatePassData) return 'pending';

  const sim = nameSimilarity(entry.item_name, entry.gatepass_item_name);
  const reqQty = Number(entry.req_qty) || 0;
  const recvQty = Number(entry.received_qty) || 0;

  const nameOk = sim >= 0.5;
  const qtyOk = reqQty > 0 ? recvQty >= reqQty : recvQty > 0;
  const qtyPartial = reqQty > 0 && recvQty > 0 && recvQty < reqQty;

  if (nameOk && qtyOk) return 'matched';
  if ((nameOk && qtyPartial) || (sim >= 0.3 && recvQty > 0)) return 'partial';
  return 'mismatched';
}

module.exports = { computeAutoStatus, nameSimilarity };
