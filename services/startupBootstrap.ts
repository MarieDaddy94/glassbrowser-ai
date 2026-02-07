import {
  APP_BOOT_PERMISSION_SCOPES as APP_BOOT_PERMISSION_SCOPES_RUNTIME,
  isPermissionDeniedResult as isPermissionDeniedResultRuntime,
  readResultError as readResultErrorRuntime,
  runStartupBootstrap as runStartupBootstrapRuntime
} from './startupBootstrapRuntime';

type StartupBootstrapOptions = {
  source?: string;
  readLocalOpenAiKey?: () => string | null;
  lastKnownOpenAiReady?: boolean;
  lastKnownTradeLockerReady?: boolean;
  tradeLockerSavedConfig?: {
    server?: string | null;
    email?: string | null;
    accountId?: number | string | null;
  } | null;
};

export type StartupBootstrapResult = {
  requestedScopes: string[];
  skippedScopes: string[];
  activeScopes: string[];
  blockedScopes: string[];
  unknownScopes: string[];
  openaiReady: boolean;
  openaiBlocked: boolean;
  openaiBlockedReason: string | null;
  openaiReadinessState: 'ready' | 'assumed_ready' | 'missing' | 'unknown';
  openaiFallbackSource: string | null;
  openaiProbeSource: string | null;
  tradeLockerProbeReady: boolean;
  tradeLockerReady: boolean;
  tradeLockerBlocked: boolean;
  tradeLockerBlockedReason: string | null;
  tradeLockerReadinessState: 'ready' | 'assumed_ready' | 'missing' | 'unknown';
  tradeLockerFallbackSource: string | null;
  tradeLockerProbeSource: string | null;
  probeErrors?: {
    secrets?: string | null;
    broker?: string | null;
    tradeLedger?: string | null;
    tradelocker?: string | null;
  } | null;
  probeSkippedDueToBridge?: boolean;
  bridgeState?: 'ready' | 'failed';
  bridgeError?: string | null;
  bridgeMissingPaths?: string[];
  diagnosticWarning: string | null;
  permissionResult: any;
  permissionError: string | null;
};

export const APP_BOOT_PERMISSION_SCOPES = APP_BOOT_PERMISSION_SCOPES_RUNTIME as readonly string[];
export const isPermissionDeniedResult = isPermissionDeniedResultRuntime as (value: any) => boolean;
export const readResultError = readResultErrorRuntime as (value: any) => string;

export async function runStartupBootstrap(api: any, options?: StartupBootstrapOptions): Promise<StartupBootstrapResult> {
  return runStartupBootstrapRuntime(api, options) as Promise<StartupBootstrapResult>;
}
