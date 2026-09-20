const assert = require('node:assert/strict');
const test = require('node:test');
const { buildAppwriteDownloadUrl, extractAppwriteFileId, callbackSignature } = require('./security');

test('constructs only the configured Appwrite download URL', () => {
  assert.equal(
    buildAppwriteDownloadUrl('https://cloud.appwrite.io/v1', 'builds', 'file-123'),
    'https://cloud.appwrite.io/v1/storage/buckets/builds/files/file-123/download',
  );
});

test('rejects source URLs from another host or bucket', () => {
  assert.throws(() => extractAppwriteFileId('https://attacker.example/x', 'https://cloud.appwrite.io/v1', 'builds'));
  assert.throws(() => extractAppwriteFileId('https://cloud.appwrite.io/v1/storage/buckets/other/files/file-123/download', 'https://cloud.appwrite.io/v1', 'builds'));
});

test('does not permit URL path traversal in file IDs', () => {
  assert.throws(() => buildAppwriteDownloadUrl('https://cloud.appwrite.io/v1', 'builds', '../metadata'));
});

test('produces deterministic HMAC callback signatures', () => {
  assert.equal(callbackSignature('a'.repeat(32), '1700000000', '{"status":"success"}'), 'sha256=7ceb828a3fe853fed5f1a04e925354e9682ccbca0d77bdf1248c9fcc0729316f');
});
