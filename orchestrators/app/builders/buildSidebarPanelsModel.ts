import type React from 'react';
import type {
  AppSidebarPanelsCtx,
  AppChatPanelModel,
  AppSidebarLegacyPanelModel,
  AppSidebarPanelsModel,
  AppSignalPanelModel,
  AppTradeLockerPanelModel
} from '../../../components/app/models';

export interface BuildSidebarPanelsModelInput {
  mode: AppSidebarPanelsModel['mode'];
  sidebarLazyFallback: React.ReactNode;
  chat: AppChatPanelModel;
  signal: AppSignalPanelModel;
  tradeLocker: AppTradeLockerPanelModel;
  legacy: AppSidebarLegacyPanelModel;
}

export const buildSidebarPanelsModel = (input: BuildSidebarPanelsModelInput): AppSidebarPanelsModel => ({
  ctx: {
    ...(input.legacy || {}),
    ...(input.chat || {}),
    ...(input.signal || {}),
    ...(input.tradeLocker || {}),
    mode: input.mode,
    SIDEBAR_LAZY_FALLBACK: input.sidebarLazyFallback
  } as AppSidebarPanelsCtx,
  mode: input.mode,
  SIDEBAR_LAZY_FALLBACK: input.sidebarLazyFallback,
  chat: input.chat,
  signal: input.signal,
  tradeLocker: input.tradeLocker,
  legacy: input.legacy
});
