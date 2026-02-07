import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: mode === 'production' ? './' : '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      build: {
        sourcemap: true,
        minify: 'terser',
        terserOptions: {
          compress: {
            passes: 3,
            toplevel: true
          },
          mangle: {
            toplevel: true
          },
          format: {
            comments: false
          }
        },
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id) return undefined;
              if (id.includes('node_modules')) {
                if (id.includes('react') || id.includes('react-dom') || id.includes('lucide-react')) {
                  return 'vendor-react';
                }
                return 'vendor';
              }
              if (
                id.includes('/hooks/useChat') ||
                id.includes('/services/openaiLiveService') ||
                id.includes('/services/tradingView')
              ) {
                return 'core-chat';
              }
              if (
                id.includes('/hooks/usePortfolio') ||
                id.includes('/hooks/useTradeLocker') ||
                id.includes('/hooks/useChartSessions') ||
                id.includes('/hooks/useBrokerLinkEngine') ||
                id.includes('/services/chartEngine') ||
                id.includes('/services/chartChatSnapshotBuilder')
              ) {
                return 'core-trading';
              }
              if (
                id.includes('/services/backtest') ||
                id.includes('/services/backtesterActionRuntime') ||
                id.includes('/services/backtestCatalogRuntime') ||
                id.includes('/services/optimizerLoopService') ||
                id.includes('/services/researchAutopilotService') ||
                id.includes('/services/replayAggregationWorkerClient') ||
                id.includes('/workers/replayAggregation.worker') ||
                id.includes('/services/warmupPlanner') ||
                id.includes('/services/historySharedCache')
              ) {
                return 'backtest-runtime-core';
              }
              if (id.includes('/services/openai') || id.includes('/services/geminiService')) {
                return 'core-ai';
              }
              if (
                id.includes('/controllers/featureControllers') ||
                id.includes('/controllers/signalController') ||
                id.includes('/controllers/shadowController') ||
                id.includes('/controllers/academyController') ||
                id.includes('/controllers/calendarController') ||
                id.includes('/controllers/executionController') ||
                id.includes('/services/executionPlaybookRuntime') ||
                id.includes('/services/telegramCallbackRuntime') ||
                id.includes('/services/telegramMessageRuntime') ||
                id.includes('/services/notesActionRuntime') ||
                id.includes('/services/auditActionRuntime') ||
                id.includes('/services/changesShadowActionRuntime') ||
                id.includes('/services/startupBootstrapRuntime') ||
                id.includes('/services/marketDataService') ||
                id.includes('/services/queueMetrics') ||
                id.includes('/services/runtimeScheduler') ||
                id.includes('/services/brokerRequestCoordinator') ||
                id.includes('/services/workerTaskRouter') ||
                id.includes('/services/diagnosticsRateLimiter') ||
                id.includes('/services/cacheBudgetManager')
              ) {
                return 'core-runtime';
              }
              if (
                id.includes('/services/catalogSignalRuntime') ||
                id.includes('/components/SignalInterface') ||
                id.includes('/workers/signalAnalysis.worker')
              ) {
                return 'signal-runtime-core';
              }
              if (
                id.includes('/services/catalogShadowRuntime') ||
                id.includes('/components/ShadowInterface') ||
                id.includes('/services/executionApi') ||
                id.includes('/services/omsService') ||
                id.includes('/services/riskGateService') ||
                id.includes('/workers/setupWatcher.worker')
              ) {
                return 'shadow-runtime-core';
              }
              if (
                id.includes('/services/setupWatcherService') ||
                id.includes('/services/setupLibraryService') ||
                id.includes('/services/regimeClassifier') ||
                id.includes('/services/setupSignalLifecycle')
              ) {
                return 'core-setups';
              }
              if (
                id.includes('/services/executionApi') ||
                id.includes('/services/brokerAdapters') ||
                id.includes('/services/brokerRouter') ||
                id.includes('/services/riskGateService') ||
                id.includes('/services/omsService')
              ) {
                return 'core-execution';
              }
              if (
                id.includes('/services/taskTreeService') ||
                id.includes('/services/actionTaskTree') ||
                id.includes('/services/autoPilotPolicy') ||
                id.includes('/services/autopilotStateMachine')
              ) {
                return 'core-orchestrator';
              }
              if (id.includes('/components/backtester/OptimizerLoopPanel')) return 'panel-backtester-optimizer-loop';
              if (id.includes('/components/backtester/BatchOptimizerPanel')) return 'panel-backtester-batch-optimizer';
              if (id.includes('/components/backtester/TrainingPackPanel')) return 'panel-backtester-training-pack';
              if (id.includes('/components/backtester/ResearchAutopilotPanel')) return 'panel-backtester-research';
              if (id.includes('/components/backtester/AgentMemoryPanel')) return 'panel-backtester-agent-memory';
              if (id.includes('/components/backtester/ReplayChartPanel')) return 'panel-backtester-replay-chart';
              if (id.includes('/components/backtester/StatsPerformancePanel')) return 'panel-backtester-stats';
              if (id.includes('/components/backtester/ValidationPanel')) return 'panel-backtester-validation';
              if (id.includes('/components/backtester/TimelineTruthPanel')) return 'panel-backtester-timeline-truth';
              if (id.includes('/components/backtester/StrategyConfigPanel')) return 'panel-backtester-strategy-config';
              if (id.includes('/components/settings/AiKeysSection')) return 'panel-settings-ai';
              if (id.includes('/components/settings/SignalAndWarmupSection')) return 'panel-settings-signal';
              if (id.includes('/components/settings/PerformanceAndDebugSection')) return 'panel-settings-performance';
              if (id.includes('/components/settings/BrokerAdapterSection')) return 'panel-settings-broker';
              if (id.includes('/components/settings/TelemetrySection')) return 'panel-settings-telemetry';
              if (id.includes('/services/actionCatalog') || id.includes('/services/taskTree') || id.includes('/services/autoPilotPolicy')) {
                return 'core-automation';
              }
              return undefined;
            }
          }
        }
      },
      define: {
        // Default API_KEY to OpenAI if present, else Gemini (for Live/TTS fallback)
        'process.env.API_KEY': JSON.stringify(env.OPENAI_API_KEY || env.GEMINI_API_KEY),
        'process.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY),
        'process.env.OPENAI_LIVE_MODEL': JSON.stringify(env.OPENAI_LIVE_MODEL || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
