const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('health and system snapshots include enterprise telemetry sections', () => {
  const types = read('types.ts');
  const app = read('App.tsx');

  assert.equal(types.includes('export interface SecurityAuditSnapshot'), true);
  assert.equal(types.includes('export interface BridgeLifecycleSnapshot'), true);
  assert.equal(types.includes('export interface RenderPerfSnapshot'), true);
  assert.equal(types.includes('export interface CiValidationSnapshot'), true);

  assert.equal(types.includes('securityAudit?: SecurityAuditSnapshot | null;'), true);
  assert.equal(types.includes('bridgeLifecycle?: BridgeLifecycleSnapshot | null;'), true);
  assert.equal(types.includes('renderPerf?: RenderPerfSnapshot | null;'), true);
  assert.equal(types.includes('ciValidation?: CiValidationSnapshot | null;'), true);

  assert.equal(app.includes('securityAuditSnapshotRef = React.useRef<HealthSnapshot[\'securityAudit\']>(null);'), true);
  assert.equal(app.includes('bridgeLifecycleSnapshotRef = React.useRef<HealthSnapshot[\'bridgeLifecycle\']>(null);'), true);
  assert.equal(app.includes('renderPerfSnapshotRef = React.useRef<HealthSnapshot[\'renderPerf\']>(null);'), true);
  assert.equal(app.includes('ciValidationSnapshotRef = React.useRef<HealthSnapshot[\'ciValidation\']>(null);'), true);

  assert.equal(app.includes('securityAudit: securityAuditSnapshotRef.current'), true);
  assert.equal(app.includes('bridgeLifecycle: bridgeLifecycleSnapshotRef.current'), true);
  assert.equal(app.includes('renderPerf: renderPerfSnapshotRef.current'), true);
  assert.equal(app.includes('ciValidation: ciValidationSnapshotRef.current'), true);
});
