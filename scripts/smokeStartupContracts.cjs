const fs = require('fs');
const path = require('path');

function mustInclude(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label} missing required fragment: ${needle}`);
  }
}

function mustNotInclude(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`${label} contains forbidden fragment: ${needle}`);
  }
}

function runStartupContractSmoke(repoRoot) {
  const appPath = path.join(repoRoot, 'App.tsx');
  const gatePath = path.join(repoRoot, 'components', 'OnboardingGate.tsx');
  const startupPath = path.join(repoRoot, 'services', 'startupBootstrapRuntime.js');
  const startupHookPath = path.join(repoRoot, 'hooks', 'useStartupReadiness.ts');
  const preloadPath = path.join(repoRoot, 'electron', 'preload.cjs');
  const appSource = fs.readFileSync(appPath, 'utf8');
  const gateSource = fs.readFileSync(gatePath, 'utf8');
  const startupSource = fs.readFileSync(startupPath, 'utf8');
  const startupHookSource = fs.readFileSync(startupHookPath, 'utf8');
  const preloadSource = fs.readFileSync(preloadPath, 'utf8');

  mustInclude(appSource, 'useStartupReadiness({', 'App bootstrap');
  mustInclude(startupHookSource, 'runStartupBootstrap', 'Bootstrap helper wiring');
  mustInclude(startupSource, 'permissions.set({', 'Permission setup');
  mustInclude(startupSource, 'permissions.allowedScopes', 'Permission allowlist introspection');
  mustInclude(startupSource, ':filtered_retry', 'Permission fallback retry');
  mustInclude(startupSource, 'api?.secrets?.getStatus?.()', 'Startup probe');
  mustInclude(startupSource, 'api?.broker?.getActive?.()', 'Startup probe');
  mustInclude(startupSource, 'api?.tradeLedger?.stats?.()', 'Startup probe');
  mustInclude(startupSource, 'api?.tradelocker?.getSavedConfig?.()', 'Startup probe');
  mustInclude(startupSource, 'probeSkippedDueToBridge', 'Bridge probe classification');
  mustInclude(startupSource, 'bridgeState', 'Bridge state classification');

  mustInclude(gateSource, 'OpenAI check blocked:', 'Onboarding blocked classification');
  mustInclude(gateSource, 'TradeLocker check blocked:', 'Onboarding blocked classification');
  mustInclude(preloadSource, 'allowedScopes: getAllowedScopes', 'Preload permissions API');
  mustInclude(preloadSource, 'generated scope module missing; falling back to inline allowlist', 'Preload generated-scope fallback');
  mustNotInclude(preloadSource, "require('path')", 'Preload sandbox compatibility');
  mustNotInclude(preloadSource, 'path.resolve(', 'Preload sandbox compatibility');

  return {
    ok: true,
    checked: [
      'app_boot bootstrap',
      'permission fallback retry',
      'critical startup probes',
      'onboarding blocked messaging'
    ]
  };
}

function runCli() {
  const repoRoot = process.cwd();
  const result = runStartupContractSmoke(repoRoot);
  console.log(`[smokeStartupContracts] ok (${result.checked.join(', ')})`);
}

if (require.main === module) {
  runCli();
}

module.exports = {
  runStartupContractSmoke
};
