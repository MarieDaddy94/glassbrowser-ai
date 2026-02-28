import {
  buildTradeLockerAccountKey,
  parseTradeLockerAccountKey
} from './tradeLockerIdentity';

const asText = (value: unknown) => String(value || '').trim();
const asLower = (value: unknown) => asText(value).toLowerCase();

const parseMt5AccountKey = (value: unknown): { login: string; server: string } | null => {
  const raw = asText(value);
  if (!raw) return null;
  const parts = raw.split(':').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const login = asLower(parts[0]);
  const server = asLower(parts.slice(1).join(':'));
  if (!login || !server) return null;
  return { login, server };
};

const normalizeGenericAccountKey = (value: unknown) => {
  const raw = asLower(value);
  if (!raw) return '';
  return raw.replace(/^account:/, '');
};

export const normalizeAccountKeyLoose = (value: unknown): string => {
  const raw = asText(value);
  if (!raw) return '';
  const parsedTradeLocker = parseTradeLockerAccountKey(raw);
  if (parsedTradeLocker) {
    const normalized = buildTradeLockerAccountKey({
      env: parsedTradeLocker.env,
      server: parsedTradeLocker.server,
      accountId: parsedTradeLocker.accountId,
      accNum: parsedTradeLocker.accNum ?? null
    });
    if (normalized) return `tradelocker:${normalized}`;
  }
  const parsedMt5 = parseMt5AccountKey(raw);
  if (parsedMt5) {
    return `mt5:${parsedMt5.login}:${parsedMt5.server}`;
  }
  return normalizeGenericAccountKey(raw);
};

export const areAccountKeysEquivalent = (left: unknown, right: unknown): boolean => {
  const leftRaw = asText(left);
  const rightRaw = asText(right);
  if (!leftRaw || !rightRaw) return false;

  const leftTradeLocker = parseTradeLockerAccountKey(leftRaw);
  const rightTradeLocker = parseTradeLockerAccountKey(rightRaw);
  if (leftTradeLocker && rightTradeLocker) {
    if (asLower(leftTradeLocker.env) !== asLower(rightTradeLocker.env)) return false;
    if (asLower(leftTradeLocker.server) !== asLower(rightTradeLocker.server)) return false;
    if (Number(leftTradeLocker.accountId) !== Number(rightTradeLocker.accountId)) return false;
    const leftAccNum = Number(leftTradeLocker.accNum || 0) || 0;
    const rightAccNum = Number(rightTradeLocker.accNum || 0) || 0;
    // Missing accNum on either side is treated as wildcard for same account identity.
    if (leftAccNum > 0 && rightAccNum > 0) {
      return leftAccNum === rightAccNum;
    }
    return true;
  }

  const leftMt5 = parseMt5AccountKey(leftRaw);
  const rightMt5 = parseMt5AccountKey(rightRaw);
  if (leftMt5 && rightMt5) {
    return leftMt5.login === rightMt5.login && leftMt5.server === rightMt5.server;
  }

  return normalizeAccountKeyLoose(leftRaw) === normalizeAccountKeyLoose(rightRaw);
};

export const selectPrimaryResultByAccountKey = <T extends { accountKey?: unknown }>(
  results: T[] | null | undefined,
  primaryAccountKey: unknown
): T | null => {
  const list = Array.isArray(results) ? results : [];
  if (list.length === 0) return null;
  const requested = asText(primaryAccountKey);
  if (!requested) return list[0] || null;
  const exact = list.find((entry) => areAccountKeysEquivalent(entry?.accountKey, requested));
  return exact || list[0] || null;
};

