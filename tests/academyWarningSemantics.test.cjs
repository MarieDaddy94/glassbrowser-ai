const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy warning banner is gated to real divergence states with resolved case rows', () => {
  const source = read('components/AcademyInterface.tsx');

  assert.equal(source.includes('const hasResolvedCaseRows = useMemo('), true);
  assert.equal(source.includes('entry?.resolvedOutcomeEnvelope?.decisionOutcome'), true);
  assert.equal(source.includes('hasResolvedOutcomeFeed && hasResolvedCaseRows && (outcomeFeedConsistency?.degraded || outcomeFeedConsistency?.stale)'), true);
});
