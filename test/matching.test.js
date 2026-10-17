const test = require('node:test');
const assert = require('node:assert/strict');
const { computeAutoStatus, nameSimilarity } = require('../routes/matching');

test('nameSimilarity: identical strings score 1', () => {
  assert.equal(nameSimilarity('Dell Laptop', 'Dell Laptop'), 1);
});

test('nameSimilarity: case/punctuation differences still match', () => {
  assert.equal(nameSimilarity('Dell Laptop!', 'dell laptop'), 1);
});

test('nameSimilarity: one name containing the other scores 0.8', () => {
  assert.equal(nameSimilarity('Laptop', 'Dell Laptop'), 0.8);
});

test('nameSimilarity: Bengali text is compared correctly', () => {
  assert.equal(nameSimilarity('ল্যাপটপ', 'ল্যাপটপ'), 1);
});

test('nameSimilarity: unrelated names score low', () => {
  assert.ok(nameSimilarity('Laptop', 'Printer Cartridge') < 0.3);
});

test('nameSimilarity: empty input scores 0', () => {
  assert.equal(nameSimilarity('', 'Laptop'), 0);
  assert.equal(nameSimilarity('Laptop', ''), 0);
});

test('computeAutoStatus: no gate-pass data yet is pending', () => {
  const status = computeAutoStatus({ item_name: 'Laptop', gatepass_item_name: '', req_qty: 5, received_qty: 0 });
  assert.equal(status, 'pending');
});

test('computeAutoStatus: matching name and sufficient quantity is matched', () => {
  const status = computeAutoStatus({ item_name: 'Dell Laptop', gatepass_item_name: 'Dell Laptop', req_qty: 5, received_qty: 5 });
  assert.equal(status, 'matched');
});

test('computeAutoStatus: matching name but short quantity is partial', () => {
  const status = computeAutoStatus({ item_name: 'Dell Laptop', gatepass_item_name: 'Dell Laptop', req_qty: 10, received_qty: 4 });
  assert.equal(status, 'partial');
});

test('computeAutoStatus: over-delivery still counts as matched', () => {
  const status = computeAutoStatus({ item_name: 'Dell Laptop', gatepass_item_name: 'Dell Laptop', req_qty: 5, received_qty: 8 });
  assert.equal(status, 'matched');
});

test('computeAutoStatus: unrelated item name with quantity received is mismatched', () => {
  const status = computeAutoStatus({ item_name: 'Laptop', gatepass_item_name: 'Printer Cartridge', req_qty: 5, received_qty: 5 });
  assert.equal(status, 'mismatched');
});

test('computeAutoStatus: no requisition quantity but something received is matched', () => {
  const status = computeAutoStatus({ item_name: 'Laptop', gatepass_item_name: 'Laptop', req_qty: 0, received_qty: 2 });
  assert.equal(status, 'matched');
});

const { analyzeEntry, hasMismatchIssue } = require('../routes/matching');

const NOW = new Date('2026-10-17T00:00:00Z');
const types = (entry, opts) => analyzeEntry(entry, { now: NOW, ...opts }).map((i) => i.type);

test('analyzeEntry: fully matching entry with proof has no issues', () => {
  const e = { item_name: 'Dell Laptop', gatepass_item_name: 'Dell Laptop', req_qty: 2, received_qty: 2, gatepass_no: 'GP-1' };
  assert.deepEqual(types(e, { attachmentCount: 1 }), []);
});

test('analyzeEntry: different item name is flagged', () => {
  const e = { item_name: 'Laptop', gatepass_item_name: 'Printer Toner', req_qty: 1, received_qty: 1, gatepass_no: 'GP-1' };
  assert.ok(types(e, { attachmentCount: 1 }).includes('name'));
});

test('analyzeEntry: short and excess quantities are flagged separately', () => {
  const base = { item_name: 'Mouse', gatepass_item_name: 'Mouse', gatepass_no: 'GP-2' };
  assert.deepEqual(types({ ...base, req_qty: 10, received_qty: 6 }, { attachmentCount: 1 }), ['short']);
  assert.deepEqual(types({ ...base, req_qty: 10, received_qty: 12 }, { attachmentCount: 1 }), ['excess']);
});

test('analyzeEntry: gate pass with zero received quantity is flagged', () => {
  const e = { item_name: 'Mouse', gatepass_item_name: 'Mouse', req_qty: 3, received_qty: 0, gatepass_no: 'GP-3' };
  assert.ok(types(e, { attachmentCount: 1 }).includes('no_qty'));
});

test('analyzeEntry: gate pass dated before the requisition is flagged', () => {
  const e = { item_name: 'Mouse', gatepass_item_name: 'Mouse', req_qty: 1, received_qty: 1, gatepass_no: 'GP-4', req_date: '2026-10-10', gatepass_date: '2026-10-05' };
  assert.ok(types(e, { attachmentCount: 1 }).includes('date'));
});

test('analyzeEntry: old requisition with no gate pass is overdue, a recent one is not', () => {
  assert.deepEqual(types({ item_name: 'Cable', req_qty: 5, req_date: '2026-10-01' }), ['overdue']);
  assert.deepEqual(types({ item_name: 'Cable', req_qty: 5, req_date: '2026-10-15' }), []);
});

test('analyzeEntry: missing proof is reported but is not a mismatch by itself', () => {
  const e = { item_name: 'Mouse', gatepass_item_name: 'Mouse', req_qty: 1, received_qty: 1, gatepass_no: 'GP-5' };
  const issues = analyzeEntry(e, { now: NOW, attachmentCount: 0 });
  assert.deepEqual(issues.map((i) => i.type), ['no_proof']);
  assert.equal(hasMismatchIssue(issues), false);
});
