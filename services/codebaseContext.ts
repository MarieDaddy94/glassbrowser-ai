export const CODEBASE_CONTEXT = `
GLASSBROWSER AI - CODE CONTEXT SNAPSHOT (CURATED)

CORE RUNTIME
- Renderer: React app in App.tsx (main orchestration, sidebar panels, state).
- Electron main: electron/main.cjs; preload: electron/preload.cjs.
- Bridges: window.glass exposes openai, tradeLedger, codebase tools, and other app services.
- Codebase tools: use root "." for repo root; includeAll=true to avoid skip lists.

AI + AGENTS
- Chat orchestration: hooks/useChat.ts (agent routing, tool dispatch, memory context).
- OpenAI: services/openaiService.ts (Responses API, gpt-5.2 default, web_search/file_search, codebase_* tools).
- Gemini: services/geminiService.ts (Gemini 3 models).
- Agent types: types.ts (Agent, Message, AgentToolAction, BrokerAction).

ACTION SYSTEM
- Action catalog: services/actionCatalog.ts defines action ids and metadata.
- Task tree: services/taskTreeService.ts (TaskTreeOrchestrator with steps observe/evaluate/decide/verify/execute/monitor/review).
- App.tsx routes tool calls to action catalog and task trees.

LOGGING / STATE
- App.tsx tracks liveErrors and hooks window error, unhandledrejection, console.error.
- ErrorBoundary.tsx catches render errors and reports via onError.
- tradeLedger (window.glass.tradeLedger) stores audit/truth events.

DATA FLOW (HIGH LEVEL)
- User -> ChatInterface -> useChat -> sendMessageToOpenAI -> tool calls -> App action handlers -> services -> UI state.
- Actions -> TaskTreeOrchestrator -> audit entries -> AuditTrail / Changes panels.
- Chart engine / watchers -> setup signals -> AutoPilot / Backtester pipelines.
`.trim();
