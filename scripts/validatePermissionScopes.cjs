const fs = require('fs');
const path = require('path');

function extractQuotedEntries(block) {
  if (!block) return [];
  const out = [];
  const re = /'([^']+)'|"([^"]+)"/g;
  let match = null;
  while ((match = re.exec(block)) != null) {
    const value = (match[1] || match[2] || '').trim();
    if (!value) continue;
    out.push(value);
  }
  return out;
}

function extractAppBootScopes(source) {
  const match = source.match(/APP_BOOT_PERMISSION_SCOPES\s*=\s*Object\.freeze\(\s*\[([\s\S]*?)\]\s*\)/m);
  if (!match) {
    throw new Error('Could not locate APP_BOOT_PERMISSION_SCOPES');
  }
  return extractQuotedEntries(match[1]);
}

function extractAllowedScopes(preloadSource) {
  const generatedPath = path.join(process.cwd(), 'electron', 'generated', 'ipcScopes.cjs');
  try {
    if (fs.existsSync(generatedPath)) {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const generated = require(generatedPath);
      if (Array.isArray(generated?.ALLOWED_SCOPES) && generated.ALLOWED_SCOPES.length > 0) {
        return generated.ALLOWED_SCOPES.map((scope) => String(scope || '').trim()).filter(Boolean);
      }
    }
  } catch {
    // ignore and fall back to source parsing
  }

  const match = preloadSource.match(/ALLOWED_SCOPES\s*=\s*new Set\(\s*\[([\s\S]*?)\]\s*\)/m);
  let block = match ? match[1] : '';
  if (!block) {
    const fallbackMatch = preloadSource.match(/:\s*\[([\s\S]*?)\]\s*\)\s*;/m);
    block = fallbackMatch ? fallbackMatch[1] : '';
  }
  if (!block) {
    throw new Error('Could not locate ALLOWED_SCOPES in electron/preload.cjs or generated scopes.');
  }
  return extractQuotedEntries(block);
}

function validatePermissionScopes(repoRoot) {
  const appPath = path.join(repoRoot, 'App.tsx');
  const startupPath = path.join(repoRoot, 'services', 'startupBootstrap.ts');
  const startupRuntimePath = path.join(repoRoot, 'services', 'startupBootstrapRuntime.js');
  const preloadPath = path.join(repoRoot, 'electron', 'preload.cjs');
  const appSource = fs.readFileSync(appPath, 'utf8');
  const startupSource = fs.existsSync(startupPath) ? fs.readFileSync(startupPath, 'utf8') : '';
  const startupRuntimeSource = fs.existsSync(startupRuntimePath) ? fs.readFileSync(startupRuntimePath, 'utf8') : '';
  const preloadSource = fs.readFileSync(preloadPath, 'utf8');
  let requestedScopes = [];
  if (startupRuntimeSource) {
    try {
      requestedScopes = extractAppBootScopes(startupRuntimeSource);
    } catch {
      requestedScopes = [];
    }
  }
  if (requestedScopes.length === 0 && startupSource) {
    try {
      requestedScopes = extractAppBootScopes(startupSource);
    } catch {
      requestedScopes = [];
    }
  }
  if (requestedScopes.length === 0) {
    requestedScopes = extractAppBootScopes(appSource);
  }
  const allowedScopes = extractAllowedScopes(preloadSource);
  const missing = requestedScopes.filter((scope) => !allowedScopes.includes(scope));
  return {
    ok: missing.length === 0,
    requestedScopes,
    allowedScopes,
    missing
  };
}

function runCli() {
  const repoRoot = process.cwd();
  const result = validatePermissionScopes(repoRoot);
  if (!result.ok) {
    console.error('[validatePermissionScopes] failed');
    console.error(`Missing in preload allowlist: ${result.missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[validatePermissionScopes] ok (${result.requestedScopes.length} requested scopes validated)`);
}

if (require.main === module) {
  runCli();
}

module.exports = {
  extractAppBootScopes,
  extractAllowedScopes,
  validatePermissionScopes
};
