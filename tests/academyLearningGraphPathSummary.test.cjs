const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('learning path service and workbench expose path summary metrics', () => {
  const service = read('services/academyLearningPathService.ts');
  const workbench = read('components/academy/LearningGraphWorkbench.tsx');
  const app = read('App.tsx');

  assert.equal(service.includes('summary: LearningPathSummary;'), true);
  assert.equal(service.includes('buildMs: number;'), true);
  assert.equal(service.includes('pathCoverage: number;'), true);
  assert.equal(service.includes('const summary: LearningPathSummary = {'), true);

  assert.equal(workbench.includes('const [activePathSummary, setActivePathSummary] = useState<LearningPathSummary | null>(null);'), true);
  assert.equal(workbench.includes('Path Summary'), true);
  assert.equal(workbench.includes('summary: result.summary,'), true);
  assert.equal(workbench.includes('pathBuildMs: result.buildMs,'), true);
  assert.equal(workbench.includes('pathCoverage: result.pathCoverage'), true);

  assert.equal(app.includes('const recordAcademyLearningPathGenerated = useCallback((payload: {'), true);
  assert.equal(app.includes('academyLearningPathSummaryRef.current = payload.summary ? {'), true);
  assert.equal(app.includes('pathBuildMs: Number(payload.pathBuildMs || 0),'), true);
  assert.equal(app.includes('pathCoverage: Number(payload.pathCoverage || 0),'), true);
});
