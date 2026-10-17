const test = require('node:test');
const assert = require('node:assert/strict');
const { validateFiles, parseIdList } = require('../lib/attachments');

const file = (bytes, name = 'a.bin') => ({ buffer: Buffer.concat([Buffer.from(bytes), Buffer.alloc(16)]), originalname: name });

test('validateFiles: accepts JPEG, PNG and PDF by their real signature', () => {
  const r = validateFiles([
    file([0xff, 0xd8, 0xff, 0xe0], 'a.jpg'),
    file([0x89, 0x50, 0x4e, 0x47], 'b.png'),
    file(Buffer.from('%PDF-1.4'), 'c.pdf')
  ]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.files.map((f) => f.mime), ['image/jpeg', 'image/png', 'application/pdf']);
});

test('validateFiles: rejects a file whose content is not an allowed type', () => {
  const r = validateFiles([file(Buffer.from('<svg onload=alert(1)>'), 'evil.png')]);
  assert.equal(r.ok, false);
});

test('validateFiles: no files is fine', () => {
  assert.deepEqual(validateFiles(undefined), { ok: true, files: [] });
});

test('parseIdList: handles missing, single and repeated values', () => {
  assert.deepEqual(parseIdList(undefined), []);
  assert.deepEqual(parseIdList('4'), [4]);
  assert.deepEqual(parseIdList(['1', 'x', '-2', '7']), [1, 7]);
});
