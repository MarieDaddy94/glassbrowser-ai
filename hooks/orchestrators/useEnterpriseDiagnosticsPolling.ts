import React from 'react';

type UseEnterpriseDiagnosticsPollingArgs = {
  enterpriseFeatureFlagsRef: React.MutableRefObject<any>;
  ciValidationSnapshotRef: React.MutableRefObject<any>;
  securityAuditSnapshotRef: React.MutableRefObject<any>;
  renderPerfSnapshotRef: React.MutableRefObject<any>;
  bridgeLifecycleSnapshotRef: React.MutableRefObject<any>;
  loadFeatureControllers: () => Promise<any>;
};

export const useEnterpriseDiagnosticsPolling = (args: UseEnterpriseDiagnosticsPollingArgs) => {
  const {
    enterpriseFeatureFlagsRef,
    ciValidationSnapshotRef,
    securityAuditSnapshotRef,
    renderPerfSnapshotRef,
    bridgeLifecycleSnapshotRef,
    loadFeatureControllers
  } = args;

  React.useEffect(() => {
    const flags = enterpriseFeatureFlagsRef.current;
    if (!flags.securityAuditV1 && !flags.mt5BridgeAuthV1) return;
    let cancelled = false;
    let stop: (() => void) | null = null;

    const refreshEnterpriseDiagnostics = async () => {
      if (cancelled) return;
      const diagnostics = window.glass?.diagnostics;
      const mt5 = window.glass?.mt5;

      if (diagnostics?.getAppMeta) {
        try {
          const appMetaRes: any = await diagnostics.getAppMeta();
          if (!cancelled) {
            const meta = appMetaRes?.ok ? (appMetaRes.meta || {}) : {};
            ciValidationSnapshotRef.current = {
              generatedAtMs: Date.now(),
              lane: meta?.isPackaged ? 'packaged-runtime' : 'dev-runtime',
              platform: meta?.platform || (typeof navigator !== 'undefined' ? navigator.platform : null),
              node: meta?.node || null,
              electron: meta?.electron || null,
              baselineAuditAvailable: true,
              pythonTestsEnabled: true,
              e2eEnabled: !!flags.electronE2EV1,
              windowsReady: String(meta?.platform || '').toLowerCase().startsWith('win')
            };
          }
        } catch {
          if (!cancelled) {
            ciValidationSnapshotRef.current = {
              generatedAtMs: Date.now(),
              lane: 'runtime-unavailable',
              baselineAuditAvailable: false,
              pythonTestsEnabled: true,
              e2eEnabled: !!flags.electronE2EV1,
              windowsReady: null
            };
          }
        }
      }

      if (flags.securityAuditV1 && diagnostics?.getSecurityAuditSnapshot) {
        try {
          const auditRes: any = await diagnostics.getSecurityAuditSnapshot();
          if (!cancelled) {
            securityAuditSnapshotRef.current = auditRes?.ok
              ? {
                  generatedAtMs: Number(auditRes?.generatedAtMs || Date.now()),
                  isPackaged: auditRes?.isPackaged ?? null,
                  csp: auditRes?.csp || null,
                  windows: Array.isArray(auditRes?.windows) ? auditRes.windows : [],
                  lastError: null
                }
              : {
                  generatedAtMs: Date.now(),
                  isPackaged: null,
                  csp: null,
                  windows: null,
                  lastError: String(auditRes?.error || 'Security audit snapshot unavailable.')
                };
          }
        } catch (err: any) {
          if (!cancelled) {
            securityAuditSnapshotRef.current = {
              generatedAtMs: Date.now(),
              isPackaged: null,
              csp: null,
              windows: null,
              lastError: err?.message ? String(err.message) : 'Security audit snapshot unavailable.'
            };
          }
        }
      }

      if (flags.securityAuditV1 && diagnostics?.getRenderPerfSnapshot) {
        try {
          const perfRes: any = await diagnostics.getRenderPerfSnapshot();
          if (!cancelled) {
            renderPerfSnapshotRef.current = perfRes?.ok
              ? {
                  generatedAtMs: Number(perfRes?.generatedAtMs || Date.now()),
                  appUptimeSec: Number.isFinite(Number(perfRes?.appUptimeSec)) ? Number(perfRes.appUptimeSec) : null,
                  windows: Number.isFinite(Number(perfRes?.windows)) ? Number(perfRes.windows) : null,
                  memory: perfRes?.memory || null,
                  runtime: perfRes?.runtime || null,
                  lastError: null
                }
              : {
                  generatedAtMs: Date.now(),
                  appUptimeSec: null,
                  windows: null,
                  memory: null,
                  runtime: null,
                  lastError: String(perfRes?.error || 'Render perf snapshot unavailable.')
                };
          }
        } catch (err: any) {
          if (!cancelled) {
            renderPerfSnapshotRef.current = {
              generatedAtMs: Date.now(),
              appUptimeSec: null,
              windows: null,
              memory: null,
              runtime: null,
              lastError: err?.message ? String(err.message) : 'Render perf snapshot unavailable.'
            };
          }
        }
      }

      if (flags.mt5BridgeAuthV1 && mt5?.getLifecycleStatus) {
        try {
          const lifecycleRes: any = await mt5.getLifecycleStatus();
          if (!cancelled) {
            bridgeLifecycleSnapshotRef.current = lifecycleRes?.ok
              ? {
                  generatedAtMs: Date.now(),
                  running: lifecycleRes?.running ?? null,
                  pid: Number.isFinite(Number(lifecycleRes?.pid)) ? Number(lifecycleRes.pid) : null,
                  port: Number.isFinite(Number(lifecycleRes?.port)) ? Number(lifecycleRes.port) : null,
                  authEnabled: lifecycleRes?.authEnabled ?? null,
                  tokenPresent: lifecycleRes?.tokenPresent ?? null,
                  lastHeartbeatAtMs: Number.isFinite(Number(lifecycleRes?.lastHeartbeatAtMs))
                    ? Number(lifecycleRes.lastHeartbeatAtMs)
                    : null,
                  lastHeartbeatOk: lifecycleRes?.lastHeartbeatOk ?? null,
                  heartbeatMisses: Number.isFinite(Number(lifecycleRes?.heartbeatMisses))
                    ? Number(lifecycleRes.heartbeatMisses)
                    : null,
                  restartCount: Number.isFinite(Number(lifecycleRes?.restartCount))
                    ? Number(lifecycleRes.restartCount)
                    : null,
                  lastExitAtMs: Number.isFinite(Number(lifecycleRes?.lastExitAtMs))
                    ? Number(lifecycleRes.lastExitAtMs)
                    : null,
                  lastExitCode: Number.isFinite(Number(lifecycleRes?.lastExitCode))
                    ? Number(lifecycleRes.lastExitCode)
                    : null,
                  lastExitSignal: lifecycleRes?.lastExitSignal ? String(lifecycleRes.lastExitSignal) : null,
                  lastError: lifecycleRes?.lastError ? String(lifecycleRes.lastError) : null
                }
              : {
                  generatedAtMs: Date.now(),
                  running: null,
                  pid: null,
                  port: null,
                  authEnabled: null,
                  tokenPresent: null,
                  lastHeartbeatAtMs: null,
                  lastHeartbeatOk: null,
                  heartbeatMisses: null,
                  restartCount: null,
                  lastExitAtMs: null,
                  lastExitCode: null,
                  lastExitSignal: null,
                  lastError: String(lifecycleRes?.error || 'Bridge lifecycle snapshot unavailable.')
                };
          }
        } catch (err: any) {
          if (!cancelled) {
            bridgeLifecycleSnapshotRef.current = {
              generatedAtMs: Date.now(),
              running: null,
              pid: null,
              port: null,
              authEnabled: null,
              tokenPresent: null,
              lastHeartbeatAtMs: null,
              lastHeartbeatOk: null,
              heartbeatMisses: null,
              restartCount: null,
              lastExitAtMs: null,
              lastExitCode: null,
              lastExitSignal: null,
              lastError: err?.message ? String(err.message) : 'Bridge lifecycle snapshot unavailable.'
            };
          }
        }
      }
    };

    void refreshEnterpriseDiagnostics();
    void loadFeatureControllers().then((mod) => {
      if (cancelled) return;
      stop = mod.startIntervalControllerSafe({
        intervalMs: 15_000,
        onTick: () => refreshEnterpriseDiagnostics()
      });
    }).catch(() => {});

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [bridgeLifecycleSnapshotRef, ciValidationSnapshotRef, enterpriseFeatureFlagsRef, loadFeatureControllers, renderPerfSnapshotRef, securityAuditSnapshotRef]);
};
