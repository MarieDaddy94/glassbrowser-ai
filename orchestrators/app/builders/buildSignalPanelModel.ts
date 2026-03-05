import type { AppSignalPanelModel } from '../../../components/app/models';

export const buildSignalPanelModel = <T extends AppSignalPanelModel>(input: T): AppSignalPanelModel => ({
  ...input,
  signalEntries: Array.isArray(input.signalEntries) ? input.signalEntries : [],
  signalStatusReportsBySignalId:
    input.signalStatusReportsBySignalId && typeof input.signalStatusReportsBySignalId === 'object'
      ? input.signalStatusReportsBySignalId
      : {},
  signalContextById:
    input.signalContextById && typeof input.signalContextById === 'object'
      ? input.signalContextById
      : {}
});
