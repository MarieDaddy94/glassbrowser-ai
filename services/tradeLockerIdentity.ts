export type TradeLockerAccountIdentity = {
  env?: string | null;
  server?: string | null;
  accountId?: number | null;
  accNum?: number | null;
  accountKey?: string | null;
};

export type TradeLockerAccountNormalized = {
  accountId: number;
  accNum: number | null;
  env: string | null;
  server: string | null;
  accountKey: string | null;
  aliases: string[];
};

export type TradeLockerProfileIdParts = {
  baseId: string;
  accountId: number | null;
  accNum: number | null;
};

const normalizeText = (value: any) => String(value || '').trim();
const normalizeLower = (value: any) => normalizeText(value).toLowerCase();

const parsePositiveInt = (value: any): number | null => {
  if (value == null) return null;
  const raw = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return Math.trunc(raw);
};

const pickFirstPositiveInt = (input: any, keys: string[]): number | null => {
  if (!input || typeof input !== 'object') return null;
  for (const key of keys) {
    const parsed = parsePositiveInt((input as any)[key]);
    if (parsed != null) return parsed;
  }
  return null;
};

export const parseTradeLockerAccountNumber = (value: any): number | null => parsePositiveInt(value);

export const buildTradeLockerAccountFallbackKey = (input?: TradeLockerAccountIdentity | null) => {
  if (!input) return '';
  const env = normalizeLower(input.env);
  const server = normalizeLower(input.server);
  const accountId = parsePositiveInt(input.accountId);
  if (!env || !server || accountId == null) return '';
  return [env, server, String(accountId), '0'].join(':');
};

export const normalizeTradeLockerAccountRecord = (
  input: any,
  context?: { env?: string | null; server?: string | null }
): TradeLockerAccountNormalized | null => {
  const accountId = pickFirstPositiveInt(input, ['accountId', 'accountID', 'id']);
  if (accountId == null) return null;

  const accNum = pickFirstPositiveInt(input, ['accNum', 'accountNum', 'accountNumber']);
  const env = normalizeLower(context?.env ?? input?.env ?? input?.environment);
  const server = normalizeLower(context?.server ?? input?.server);
  const fallbackKey = buildTradeLockerAccountFallbackKey({
    env,
    server,
    accountId
  });
  const accountKey = accNum != null
    ? buildTradeLockerAccountKey({
        env,
        server,
        accountId,
        accNum
      })
    : fallbackKey;
  const aliases = Array.from(
    new Set([accountKey, fallbackKey].filter((value): value is string => !!value))
  );
  return {
    accountId,
    accNum,
    env: env || null,
    server: server || null,
    accountKey: accountKey || null,
    aliases
  };
};

export const buildTradeLockerAccountKey = (input?: TradeLockerAccountIdentity | null) => {
  if (!input) return '';
  const env = normalizeLower(input.env);
  const server = normalizeLower(input.server);
  const accountId = parsePositiveInt(input.accountId);
  const accNum = parsePositiveInt(input.accNum);
  if (!env || !server || accountId == null) return '';
  return [env, server, String(accountId), accNum != null ? String(accNum) : ''].filter(Boolean).join(':');
};

const parseAccountIdentityFromFlexibleKey = (key: string) => {
  const raw = normalizeText(key);
  if (!raw) return null;
  const parts = raw.split(':').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  if (parts.length === 3) {
    const env = normalizeText(parts[0] || '');
    const server = normalizeText(parts[1] || '');
    const accountId = parsePositiveInt(parts[2]);
    if (!env || !server || accountId == null) return null;
    return {
      env,
      server,
      accountId,
      accNum: null
    };
  }
  const accNum = parsePositiveInt(parts[parts.length - 1]);
  const accountId = parsePositiveInt(parts[parts.length - 2]);
  const server = normalizeText(parts[parts.length - 3] || '');
  const env = normalizeText(parts[parts.length - 4] || '');
  if (!server || !env || accountId == null) return null;
  return {
    env,
    server,
    accountId,
    accNum
  };
};

export const parseTradeLockerAccountKey = (key: string) => {
  const parsed = parseAccountIdentityFromFlexibleKey(key);
  if (!parsed) return null;
  return {
    env: normalizeLower(parsed.env),
    server: normalizeLower(parsed.server),
    accountId: parsed.accountId,
    accNum: parsed.accNum ?? null
  };
};

export const normalizeTradeLockerIdentity = (input?: TradeLockerAccountIdentity | null) => {
  const env = normalizeLower(input?.env);
  const server = normalizeLower(input?.server);
  const accountId = parsePositiveInt(input?.accountId);
  const accNum = parsePositiveInt(input?.accNum);
  const keyFromParts = buildTradeLockerAccountKey({ env, server, accountId, accNum });
  const parsedFromKey = input?.accountKey ? parseTradeLockerAccountKey(String(input.accountKey)) : null;
  const accountKey = normalizeLower(
    keyFromParts ||
    (parsedFromKey
      ? buildTradeLockerAccountKey(parsedFromKey)
      : normalizeText(input?.accountKey))
  );
  const resolvedEnv = env || parsedFromKey?.env || '';
  const resolvedServer = server || parsedFromKey?.server || '';
  const resolvedAccountId = accountId ?? parsedFromKey?.accountId ?? null;
  const resolvedAccNum = accNum ?? parsedFromKey?.accNum ?? null;
  return {
    env: resolvedEnv || null,
    server: resolvedServer || null,
    accountId: resolvedAccountId,
    accNum: resolvedAccNum,
    accountKey: accountKey || null,
    hasIdentity: !!(accountKey || resolvedAccountId != null || resolvedAccNum != null || resolvedEnv || resolvedServer)
  };
};

export const resolveTradeLockerIdentityMatchState = (
  requested?: TradeLockerAccountIdentity | null,
  active?: TradeLockerAccountIdentity | null
): 'match' | 'mismatch' | 'unknown' => {
  const req = normalizeTradeLockerIdentity(requested);
  const cur = normalizeTradeLockerIdentity(active);
  if (!req.hasIdentity) return 'match';
  if (req.accountKey && cur.accountKey && req.accountKey === cur.accountKey) return 'match';
  if (req.accountId != null) {
    if (cur.accountId == null) return 'unknown';
    if (cur.accountId !== req.accountId) return 'mismatch';
  }
  if (req.accNum != null) {
    if (cur.accNum == null) return 'unknown';
    if (cur.accNum !== req.accNum) return 'mismatch';
  }
  if (req.env) {
    if (!cur.env) return 'unknown';
    if (cur.env !== req.env) return 'mismatch';
  }
  if (req.server) {
    if (!cur.server) return 'unknown';
    if (cur.server !== req.server) return 'mismatch';
  }
  return 'match';
};

export const buildTradeLockerProfileBaseId = (env: string, server: string, email: string) =>
  [normalizeLower(env), normalizeLower(server), normalizeLower(email)].filter(Boolean).join(':');

export const buildTradeLockerProfileId = (
  env: string,
  server: string,
  email: string,
  accountId?: number | null,
  accNum?: number | null
) => {
  const baseId = buildTradeLockerProfileBaseId(env, server, email);
  const parsedAccountId = parsePositiveInt(accountId);
  const parsedAccNum = parsePositiveInt(accNum);
  return `${baseId}::acct:${parsedAccountId != null ? String(parsedAccountId) : '0'}:${parsedAccNum != null ? String(parsedAccNum) : '0'}`;
};

export const parseTradeLockerProfileId = (id: string): TradeLockerProfileIdParts | null => {
  const raw = normalizeText(id);
  if (!raw) return null;
  const marker = raw.indexOf('::acct:');
  if (marker < 0) {
    return {
      baseId: raw,
      accountId: null,
      accNum: null
    };
  }
  const baseId = normalizeText(raw.slice(0, marker));
  const suffix = raw.slice(marker + '::acct:'.length);
  const parts = suffix.split(':');
  const accountId = parsePositiveInt(parts[0]);
  const accNum = parsePositiveInt(parts[1]);
  return {
    baseId,
    accountId,
    accNum
  };
};

export const normalizeTradeLockerProfileId = (
  id: string,
  env: string,
  server: string,
  email: string,
  accountId?: number | null,
  accNum?: number | null
) => {
  const parsed = parseTradeLockerProfileId(id);
  if (parsed && parsed.baseId.includes(':') && String(id || '').includes('::acct:')) {
    return id;
  }
  return buildTradeLockerProfileId(env, server, email, accountId, accNum);
};

export const buildTradeLockerProfileLabel = (
  env: string,
  server: string,
  email: string,
  accountId?: number | null,
  accNum?: number | null
) => {
  const cleanEmail = normalizeText(email) || 'unknown';
  const cleanServer = normalizeText(server) || 'server';
  const cleanEnv = normalizeLower(env) === 'live' ? 'live' : 'demo';
  const parsedAccountId = parsePositiveInt(accountId);
  const parsedAccNum = parsePositiveInt(accNum);
  const accountSuffix =
    parsedAccountId != null
      ? ` - acct ${parsedAccountId}${parsedAccNum != null ? `/${parsedAccNum}` : ''}`
      : '';
  return `${cleanEmail} @ ${cleanServer} (${cleanEnv})${accountSuffix}`;
};
