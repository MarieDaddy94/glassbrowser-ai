const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('tradelocker client exposes adaptive rate-limit governor telemetry', () => {
  const source = read('electron/tradelocker.cjs');

  assert.equal(source.includes('resetRateLimitTelemetryState() {'), true);
  assert.equal(source.includes('noteRateLimitTelemetry({'), true);
  assert.equal(source.includes('getRateLimitPolicyConfig() {'), true);
  assert.equal(source.includes('computeRateLimitPressure(now = nowMs(), profile = null) {'), true);
  assert.equal(source.includes('applyRateLimitGovernor(now = nowMs()) {'), true);
  assert.equal(source.includes('getRateLimitTelemetrySnapshot() {'), true);
  assert.equal(source.includes('getRateLimitPolicy() {'), true);
  assert.equal(source.includes('setRateLimitPolicy(input = {}) {'), true);
  assert.equal(source.includes('rateLimitTelemetry: this.getRateLimitTelemetrySnapshot()'), true);
  assert.equal(source.includes('rateLimitPolicy: this.rateLimitPolicy,'), true);
});

test('throttle path records blocked/rate-limited telemetry events', () => {
  const source = read('electron/tradelocker.cjs');

  assert.equal(source.includes("event: 'blocked'"), true);
  assert.equal(source.includes("event: 'rate_limited'"), true);
  assert.equal(source.includes("error: 'throttle_blocked'"), true);
  assert.equal(source.includes("error: 'http_429'"), true);
  assert.equal(source.includes('ensureRateLimitAccountTelemetry() {'), true);
  assert.equal(source.includes('topAccounts: accounts.slice'), true);
});
