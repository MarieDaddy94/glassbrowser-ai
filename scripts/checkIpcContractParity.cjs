const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const CONTRACT_PATH = path.join(ROOT, 'contracts', 'ipc.contract.json');
const MAIN_PATH = path.join(ROOT, 'electron', 'main.cjs');
const PRELOAD_PATH = path.join(ROOT, 'electron', 'preload.cjs');
const APP_PATH = path.join(ROOT, 'App.tsx');

const {
  parseMainChannels,
  parsePreloadChannelScopes,
  parseAllowlistScopes,
  parseAppBootScopes
} = require('./generateIpcContract.cjs');

function readJson(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(text);
}

function toSortedUnique(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
}

function compareSets(expected, actual) {
  const missing = expected.filter((value) => !actual.includes(value));
  const extra = actual.filter((value) => !expected.includes(value));
  return { missing, extra };
}

function checkParity() {
  if (!fs.existsSync(CONTRACT_PATH)) {
    return { ok: false, error: `Contract file missing: ${CONTRACT_PATH}` };
  }

  const contract = readJson(CONTRACT_PATH);
  const mainSource = fs.readFileSync(MAIN_PATH, 'utf8');
  const preloadSource = fs.readFileSync(PRELOAD_PATH, 'utf8');
  const appSource = fs.readFileSync(APP_PATH, 'utf8');

  const contractChannels = toSortedUnique((contract.channels || []).map((entry) => entry?.name));
  const actualMainChannels = parseMainChannels(mainSource);
  const actualPreloadMap = parsePreloadChannelScopes(preloadSource);
  const actualPreloadChannels = toSortedUnique(Array.from(actualPreloadMap.keys()));
  const actualAllChannels = toSortedUnique([...actualMainChannels, ...actualPreloadChannels]);

  const contractAllowedScopes = toSortedUnique(contract.allowedScopes || []);
  const actualAllowedScopes = parseAllowlistScopes(preloadSource);
  const appBootScopes = parseAppBootScopes(appSource);

  const channelDiff = compareSets(contractChannels, actualAllChannels);
  const scopeDiff = compareSets(contractAllowedScopes, actualAllowedScopes);
  const missingBootScopes = appBootScopes.filter((scope) => !actualAllowedScopes.includes(scope));

  const out = {
    ok: channelDiff.missing.length === 0 &&
      channelDiff.extra.length === 0 &&
      scopeDiff.missing.length === 0 &&
      scopeDiff.extra.length === 0 &&
      missingBootScopes.length === 0,
    channelDiff,
    scopeDiff,
    missingBootScopes,
    counts: {
      contractChannels: contractChannels.length,
      actualChannels: actualAllChannels.length,
      contractAllowedScopes: contractAllowedScopes.length,
      actualAllowedScopes: actualAllowedScopes.length
    }
  };
  return out;
}

function runCli() {
  const result = checkParity();
  if (!result.ok) {
    console.error('[checkIpcContractParity] failed');
    if (result.error) console.error(result.error);
    if (result.channelDiff?.missing?.length) {
      console.error(`Missing channels in code: ${result.channelDiff.missing.join(', ')}`);
    }
    if (result.channelDiff?.extra?.length) {
      console.error(`Untracked channels in code: ${result.channelDiff.extra.join(', ')}`);
    }
    if (result.scopeDiff?.missing?.length) {
      console.error(`Missing scopes in preload allowlist: ${result.scopeDiff.missing.join(', ')}`);
    }
    if (result.scopeDiff?.extra?.length) {
      console.error(`Untracked scopes in preload allowlist: ${result.scopeDiff.extra.join(', ')}`);
    }
    if (result.missingBootScopes?.length) {
      console.error(`Boot scopes not allowed: ${result.missingBootScopes.join(', ')}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(
    `[checkIpcContractParity] ok (${result.counts.contractChannels} channels, ${result.counts.contractAllowedScopes} scopes)`
  );
}

if (require.main === module) {
  runCli();
}

module.exports = {
  checkParity
};

