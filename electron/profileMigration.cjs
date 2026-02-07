const fs = require('fs');
const path = require('path');

const SECRETS_FILE = 'ai-secrets.json';
const TRADELOCKER_CONFIG_FILE = 'tradelocker.json';
const PROFILE_MIGRATION_MARKER_FILE = 'profile-migration-v1.json';
const PROFILE_MIGRATION_FILES = Object.freeze([SECRETS_FILE, TRADELOCKER_CONFIG_FILE]);
const PROFILE_MIGRATION_OPTIONAL_FILES = Object.freeze(['trade-ledger.sqlite', 'trade-ledger.json']);

function safeJsonParseLoose(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readJsonFileLoose(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const text = fs.readFileSync(filePath, 'utf8');
    return safeJsonParseLoose(text);
  } catch {
    return null;
  }
}

function hasConfiguredSecretsAt(userDataPath) {
  try {
    const parsed = readJsonFileLoose(path.join(userDataPath, SECRETS_FILE));
    if (!parsed || typeof parsed !== 'object') return false;
    const openai = String(parsed?.openai?.key || '').trim();
    const gemini = String(parsed?.gemini?.key || '').trim();
    return !!openai || !!gemini;
  } catch {
    return false;
  }
}

function hasConfiguredTradeLockerAt(userDataPath) {
  try {
    const parsed = readJsonFileLoose(path.join(userDataPath, TRADELOCKER_CONFIG_FILE));
    if (!parsed || typeof parsed !== 'object') return false;
    const server = String(parsed?.server || '').trim();
    const email = String(parsed?.email || '').trim();
    const accountId = Number(parsed?.accountId);
    return !!server && !!email && Number.isFinite(accountId);
  } catch {
    return false;
  }
}

function hasAnyFileAt(userDataPath, filename) {
  try {
    const filePath = path.join(userDataPath, filename);
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    return !!stat?.isFile?.() && Number(stat?.size || 0) > 0;
  } catch {
    return false;
  }
}

function copyFileIfMissingOrEmpty(sourcePath, destinationPath) {
  try {
    if (!fs.existsSync(sourcePath)) return { ok: false, copied: false, reason: 'source_missing' };
    const sourceStat = fs.statSync(sourcePath);
    if (!sourceStat?.isFile?.() || Number(sourceStat?.size || 0) <= 0) {
      return { ok: false, copied: false, reason: 'source_empty' };
    }
    if (fs.existsSync(destinationPath)) {
      const destinationStat = fs.statSync(destinationPath);
      if (destinationStat?.isFile?.() && Number(destinationStat?.size || 0) > 0) {
        return { ok: false, copied: false, reason: 'destination_has_data' };
      }
    }
    fs.copyFileSync(sourcePath, destinationPath);
    return { ok: true, copied: true };
  } catch (err) {
    return { ok: false, copied: false, reason: err?.message || String(err) };
  }
}

function getProfileMigrationMarkerPath(userDataPath) {
  return path.join(userDataPath, PROFILE_MIGRATION_MARKER_FILE);
}

function writeProfileMigrationMarker(userDataPath, payload, nowMs = Date.now) {
  try {
    const markerPath = getProfileMigrationMarkerPath(userDataPath);
    const marker = {
      version: 1,
      ts: Number(nowMs()) || Date.now(),
      ...payload
    };
    fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2), 'utf8');
    return { ok: true, markerPath };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

function listLegacyProfileCandidates(currentUserDataPath) {
  const parentDir = path.dirname(currentUserDataPath);
  const currentBase = String(path.basename(currentUserDataPath || '') || '').toLowerCase();
  const preferredNames = new Set([
    'glassbrowser ai',
    'glassbrowser ai beta',
    'glassbrowser-ai',
    'glassbrowser-ai-beta'
  ]);
  const candidates = [];
  let entries = [];
  try {
    entries = fs.readdirSync(parentDir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!entry?.isDirectory?.()) continue;
    const name = String(entry.name || '');
    const lower = name.toLowerCase();
    if (!name || lower === currentBase) continue;
    const userDataPath = path.join(parentDir, name);
    const hasSecrets = hasAnyFileAt(userDataPath, SECRETS_FILE);
    const hasTradeLocker = hasAnyFileAt(userDataPath, TRADELOCKER_CONFIG_FILE);
    if (!hasSecrets && !hasTradeLocker) continue;
    let score = 0;
    if (preferredNames.has(lower)) score += 100;
    if (lower.includes('glassbrowser')) score += 50;
    if (lower.includes('beta')) score += 10;
    if (hasSecrets && hasTradeLocker) score += 20;
    let updatedAtMs = 0;
    for (const filename of PROFILE_MIGRATION_FILES) {
      const filePath = path.join(userDataPath, filename);
      try {
        if (!fs.existsSync(filePath)) continue;
        const stat = fs.statSync(filePath);
        updatedAtMs = Math.max(updatedAtMs, Number(stat?.mtimeMs || 0));
      } catch {
        // ignore stat failures
      }
    }
    candidates.push({ userDataPath, score, updatedAtMs });
  }
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return Number(b.updatedAtMs || 0) - Number(a.updatedAtMs || 0);
  });
  return candidates.map((entry) => entry.userDataPath);
}

function runOneTimeProfileMigration(options = {}) {
  const currentUserDataPath = String(options.currentUserDataPath || '').trim();
  const appendMainLog = typeof options.appendMainLog === 'function' ? options.appendMainLog : null;
  const nowMs = typeof options.nowMs === 'function' ? options.nowMs : Date.now;
  const status = {
    migrationAttempted: true,
    migrationApplied: false,
    migrationSource: null,
    migrationFiles: [],
    migrationReason: null
  };

  if (!currentUserDataPath) {
    status.migrationReason = 'userData_unavailable';
    return status;
  }

  const markerPath = getProfileMigrationMarkerPath(currentUserDataPath);
  if (fs.existsSync(markerPath)) {
    const marker = readJsonFileLoose(markerPath);
    status.migrationReason = 'already_attempted';
    if (marker && typeof marker === 'object') {
      status.migrationApplied = marker.migrationApplied === true;
      status.migrationSource = marker.migrationSource || null;
      status.migrationFiles = Array.isArray(marker.migrationFiles) ? marker.migrationFiles.slice() : [];
    }
    return status;
  }

  const currentHasState = hasConfiguredSecretsAt(currentUserDataPath) || hasConfiguredTradeLockerAt(currentUserDataPath);
  if (currentHasState) {
    status.migrationReason = 'current_profile_has_state';
    writeProfileMigrationMarker(currentUserDataPath, status, nowMs);
    return status;
  }

  const candidates = listLegacyProfileCandidates(currentUserDataPath);
  if (!candidates.length) {
    status.migrationReason = 'no_legacy_candidates';
    writeProfileMigrationMarker(currentUserDataPath, status, nowMs);
    return status;
  }

  for (const candidatePath of candidates) {
    const copied = [];
    for (const filename of PROFILE_MIGRATION_FILES) {
      const sourcePath = path.join(candidatePath, filename);
      const destinationPath = path.join(currentUserDataPath, filename);
      const result = copyFileIfMissingOrEmpty(sourcePath, destinationPath);
      if (result.copied) copied.push(filename);
    }
    for (const filename of PROFILE_MIGRATION_OPTIONAL_FILES) {
      const sourcePath = path.join(candidatePath, filename);
      const destinationPath = path.join(currentUserDataPath, filename);
      const result = copyFileIfMissingOrEmpty(sourcePath, destinationPath);
      if (result.copied) copied.push(filename);
    }
    if (copied.length > 0) {
      status.migrationApplied = true;
      status.migrationSource = candidatePath;
      status.migrationFiles = copied;
      status.migrationReason = 'copied';
      break;
    }
  }

  if (!status.migrationReason) {
    status.migrationReason = 'candidates_checked_no_copy';
  }

  writeProfileMigrationMarker(currentUserDataPath, status, nowMs);
  if (appendMainLog) {
    const summary = {
      source: status.migrationSource,
      files: status.migrationFiles,
      reason: status.migrationReason,
      applied: status.migrationApplied
    };
    appendMainLog(`[${new Date(Number(nowMs()) || Date.now()).toISOString()}] profile_migration ${JSON.stringify(summary)}\n`);
  }

  return status;
}

module.exports = {
  SECRETS_FILE,
  TRADELOCKER_CONFIG_FILE,
  PROFILE_MIGRATION_MARKER_FILE,
  PROFILE_MIGRATION_FILES,
  PROFILE_MIGRATION_OPTIONAL_FILES,
  getProfileMigrationMarkerPath,
  listLegacyProfileCandidates,
  runOneTimeProfileMigration
};
