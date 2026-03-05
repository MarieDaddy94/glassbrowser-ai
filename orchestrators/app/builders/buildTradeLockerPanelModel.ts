import type { AppTradeLockerPanelModel } from '../../../components/app/models';

export const buildTradeLockerPanelModel = <T extends AppTradeLockerPanelModel>(
  input: T
): AppTradeLockerPanelModel => ({
  ...input,
  tlAccounts: Array.isArray(input.tlAccounts) ? input.tlAccounts : [],
  tlAccountMetrics: input.tlAccountMetrics ?? null,
  tlSavedConfig: input.tlSavedConfig ?? null
});
