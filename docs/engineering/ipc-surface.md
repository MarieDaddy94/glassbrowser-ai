# IPC Surface Map

This doc lists the IPC channels exposed by the Electron main process and the expected usage patterns.

## IPC Envelope

All handlers are wrapped by a uniform envelope in `electron/main.cjs`:
- `ok`, `data`, `error`, `errorInfo`, `errorCode`, `retryable`, `retryAfterMs`
- `requestId`, `ts`, `timingMs`

Every call should pass a `requestId` (or allow the envelope to generate one).

## Core Domains

### Broker / TradeLocker
- `tradelocker:*` (connect, stream, place/modify/cancel/close, snapshots)
- `broker:*` (registry-based broker adapter access)

Policy:
- All broker-changing actions must be routed via ExecutionAPI in the renderer.
- Direct UI calls should be read-only (quotes, history, snapshot).

### Trade Ledger
- `tradeLedger:*` (append/list/update/reserve + agent memory + research sessions)

Usage:
- Reserve entries for idempotency before broker requests.
- Append `truth_event` and `audit_event` records for every execution step.

### OpenAI
- `openai:responses`, `openai:responsesStream`, `openai:images`

Usage:
- Always pass through the main-process proxy to avoid CORS and ensure key security.

### Gemini
- `gemini:tts`

### Codebase Tools
- `codebase:listFiles`, `codebase:search`, `codebase:readFile`, `codebase:traceDataflow`

Constraints:
- Codebase root is restricted to the app root (or `GLASS_CODEBASE_ROOT`).
- Skip directories include `.git`, `node_modules`, `dist`, `release`.

### Secrets
- `secrets:getStatus`, `secrets:setOpenAIKey`, `secrets:setGeminiKey`, `secrets:getOpenAIKey`

### Agent Runner
- `agentRunner:evaluateSignal`, `agentRunner:status`, `agentRunner:cancel`

### Window / Capture
- `window:setFullscreen`, `window:getFullscreen`
- `glass:captureWebContents`, `glass:saveUserFile`

### MT5 Bridge
- `mt5bridge:*` (local websocket bridge, optional)

### Notes
- `notes:*` (user notes and memory)

## Trust & Permissions

All IPC entry points validate the renderer sender via `isTrustedSender`.
The preload bridge exposes scoped permissions (`window.glass.permissions`) for sensitive tools.

## Error Codes

The IPC envelope maps errors to stable codes:
- `GLASS_E_RATE_LIMIT`
- `GLASS_E_TIMEOUT`
- `GLASS_E_NETWORK`
- `GLASS_E_UNAUTHORIZED`
- `GLASS_E_FORBIDDEN`
- `GLASS_E_NOT_FOUND`
- `GLASS_E_VALIDATION`
- `GLASS_E_BROKER_REJECTED`
- `GLASS_E_MARKET_CLOSED`
- `GLASS_E_INSUFFICIENT_MARGIN`

These should be surfaced in UI and used for retry/backoff decisions.
