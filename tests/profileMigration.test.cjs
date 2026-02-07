const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  PROFILE_MIGRATION_MARKER_FILE,
  runOneTimeProfileMigration
} = require('../electron/profileMigration.cjs');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'glass-profile-migration-'));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function writeLegacyFiles(dir, accountId = 42) {
  ensureDir(dir);
  writeJson(path.join(dir, 'ai-secrets.json'), {
    version: 1,
    openai: { key: 'enc:abc' },
    gemini: { key: null }
  });
  writeJson(path.join(dir, 'tradelocker.json'), {
    env: 'demo',
    server: 'demo.tradelocker.com',
    email: 'u@example.com',
    accountId
  });
}

test('profile migration copies legacy config once when current profile is empty', () => {
  const root = makeTempRoot();
  const current = path.join(root, 'GlassBrowser AI New');
  const legacy = path.join(root, 'GlassBrowser AI');
  ensureDir(current);
  writeLegacyFiles(legacy);

  const status = runOneTimeProfileMigration({ currentUserDataPath: current });
  assert.equal(status.migrationAttempted, true);
  assert.equal(status.migrationApplied, true);
  assert.equal(status.migrationReason, 'copied');
  assert.equal(status.migrationSource, legacy);
  assert.ok(Array.isArray(status.migrationFiles));
  assert.ok(status.migrationFiles.includes('ai-secrets.json'));
  assert.ok(status.migrationFiles.includes('tradelocker.json'));
  assert.equal(fs.existsSync(path.join(current, PROFILE_MIGRATION_MARKER_FILE)), true);

  const second = runOneTimeProfileMigration({ currentUserDataPath: current });
  assert.equal(second.migrationReason, 'already_attempted');
  assert.equal(second.migrationApplied, true);
  assert.equal(second.migrationSource, legacy);
});

test('profile migration does not run when current profile already has configured state', () => {
  const root = makeTempRoot();
  const current = path.join(root, 'GlassBrowser AI New');
  const legacy = path.join(root, 'GlassBrowser AI');
  ensureDir(current);
  writeLegacyFiles(current, 99);
  writeLegacyFiles(legacy, 42);

  const status = runOneTimeProfileMigration({ currentUserDataPath: current });
  assert.equal(status.migrationApplied, false);
  assert.equal(status.migrationReason, 'current_profile_has_state');

  const cfg = JSON.parse(fs.readFileSync(path.join(current, 'tradelocker.json'), 'utf8'));
  assert.equal(cfg.accountId, 99);
});

test('profile migration handles missing legacy candidates without crashing', () => {
  const root = makeTempRoot();
  const current = path.join(root, 'GlassBrowser AI New');
  ensureDir(current);

  const status = runOneTimeProfileMigration({ currentUserDataPath: current });
  assert.equal(status.migrationApplied, false);
  assert.equal(status.migrationReason, 'no_legacy_candidates');
  assert.equal(fs.existsSync(path.join(current, PROFILE_MIGRATION_MARKER_FILE)), true);
});

test('profile migration respects existing marker and does not repeat', () => {
  const root = makeTempRoot();
  const current = path.join(root, 'GlassBrowser AI New');
  ensureDir(current);
  writeJson(path.join(current, PROFILE_MIGRATION_MARKER_FILE), {
    version: 1,
    ts: Date.now(),
    migrationAttempted: true,
    migrationApplied: false,
    migrationSource: null,
    migrationFiles: [],
    migrationReason: 'no_legacy_candidates'
  });

  const status = runOneTimeProfileMigration({ currentUserDataPath: current });
  assert.equal(status.migrationReason, 'already_attempted');
  assert.equal(status.migrationApplied, false);
});
