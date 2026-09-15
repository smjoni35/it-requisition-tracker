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
