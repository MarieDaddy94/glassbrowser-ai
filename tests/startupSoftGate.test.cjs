const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const gatePath = path.join(process.cwd(), 'components', 'OnboardingGate.tsx');
const startupHookPath = path.join(process.cwd(), 'hooks', 'useStartupReadiness.ts');

test('Onboarding gate uses non-blocking setup check wording', () => {
  const source = fs.readFileSync(gatePath, 'utf8');
  assert.equal(source.includes('Setup Check'), true);
  assert.equal(source.includes('Beta Setup Required'), false);
  assert.equal(source.includes('Start Beta'), false);
});

test('Onboarding gate no longer uses full-screen blocking overlay', () => {
  const source = fs.readFileSync(gatePath, 'utf8');
  assert.equal(source.includes('fixed inset-0'), false);
  assert.equal(source.includes('pointer-events-none'), true);
});

test('Startup readiness only opens setup check after settled phase', () => {
  const source = fs.readFileSync(startupHookPath, 'utf8');
  assert.equal(source.includes("const onboardingOpen = startupPhase === 'settled'"), true);
});
