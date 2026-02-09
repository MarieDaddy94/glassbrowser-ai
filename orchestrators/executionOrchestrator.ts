export type MultiAccountExecutionRow = {
  accountKey: string;
  normalized?: boolean;
  res?: any;
};

export const buildMirrorExecutions = (
  rows: MultiAccountExecutionRow[],
  primaryAccountKey?: string | null
) => {
  const primary = String(primaryAccountKey || '').trim();
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => String(row?.accountKey || '').trim() && String(row?.accountKey || '').trim() !== primary)
    .map((row) => ({
      accountKey: String(row.accountKey),
      ok: row?.res?.ok !== false,
      orderId: row?.res?.orderId ?? row?.res?.order?.id ?? null,
      resolvedSymbol: row?.res?.resolvedSymbol ?? null,
      error: row?.res?.ok === false ? String(row?.res?.error || '') : null,
      normalized: !!row?.normalized
    }));
};
