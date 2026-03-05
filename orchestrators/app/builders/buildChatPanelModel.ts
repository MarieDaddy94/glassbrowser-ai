import type { AppChatPanelModel } from '../../../components/app/models';

export const buildChatPanelModel = <T extends AppChatPanelModel>(input: T): AppChatPanelModel => ({
  ...input,
  activeSignalThreadId: input.activeSignalThreadId ?? null,
  signalThreads: Array.isArray(input.signalThreads) ? input.signalThreads : [],
  signalContextById:
    input.signalContextById && typeof input.signalContextById === 'object'
      ? input.signalContextById
      : {}
});
