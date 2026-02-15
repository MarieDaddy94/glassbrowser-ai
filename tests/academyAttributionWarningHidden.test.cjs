const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy attribution keeps metrics but hides execution drag warning text', () => {
  const academy = read('components/AcademyInterface.tsx');

  assert.equal(academy.includes('Execution drag warning: decision edge was reduced by execution quality.'), false);
  assert.equal(academy.includes('Execution drag {formatBps(selectedAttribution.executionDragBps)}'), true);
  assert.equal(academy.includes('Decision {selectedAttribution.decisionOutcome}'), true);
});

