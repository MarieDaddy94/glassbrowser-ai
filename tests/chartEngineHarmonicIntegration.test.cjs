const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('chart engine wires harmonic detectors, detection call, and telemetry counters', () => {
  const source = read('services/chartEngine.ts');
  const app = read('App.tsx');

  assert.equal(source.includes("import { detectHarmonicPatterns } from './harmonicPatternEngine';"), true);
  assert.equal(source.includes("'harmonic_gartley'"), true);
  assert.equal(source.includes("'harmonic_bat'"), true);
  assert.equal(source.includes("'harmonic_butterfly'"), true);
  assert.equal(source.includes("'harmonic_crab'"), true);
  assert.equal(source.includes("'harmonic_deep_crab'"), true);
  assert.equal(source.includes("'harmonic_cypher'"), true);
  assert.equal(source.includes("'harmonic_shark'"), true);
  assert.equal(source.includes('const harmonicEvents = detectHarmonicPatterns({'), true);
  assert.equal(source.includes('harmonicDetectedFromRefresh'), true);
  assert.equal(source.includes('harmonicDetectedFromLive'), true);
  assert.equal(source.includes('harmonicDetectedFromStartupBackfill'), true);
  assert.equal(source.includes('harmonicDedupeSuppressed'), true);
  assert.equal(app.includes('const HARMONIC_PATTERN_DETECTORS = ['), true);
  assert.equal(app.includes("const PATTERN_SETTINGS_HARMONIC_UPGRADE_KEY = 'glass_patterns_harmonic_upgrade_v1';"), true);
});
