# Execution Contract

This contract defines the single, hardened execution corridor for any broker-changing action in GlassBrowser AI.

## Corridor (Single Choke Point)

Agent/UI -> ExecutionAPI -> RiskGate -> OMS -> BrokerAdapter -> Ledger

Rules:
- Every broker-changing action MUST flow through the ExecutionAPI.
- Agents decide trades; ExecutionAPI enforces safety, idempotency, reconciliation, and auditing.
- No direct broker writes outside this corridor.

## Current Execution Entry Points (must route through ExecutionAPI)

- `App.tsx`: `executeTradeRequest` (trade proposals)
- `App.tsx`: `executeBrokerActionRequest` (close/cancel/modify)
- `App.tsx`: `handleTradeLockerPlaceOrder` (manual ticket)
- `App.tsx`: action handlers for `tradelocker.place_order`, `tradelocker.cancel_all_orders`, `tradelocker.close_all_positions`
- `hooks/useChat.ts`: auto-execute of agent proposals via `onExecuteTrade`
- `components/TradeLockerInterface.tsx`: manual ticket placement via `onPlaceOrder`

## Primary Request Types

### TradeCommand (agent intent)

Current implementation uses `TradeProposal` with extra metadata. For parity with the roadmap, map:
- `commandId` -> `messageId` or generated UUID
- `idempotencyKey` -> `computeTradeDedupeKey(...)`
- `agentId` -> `TradeProposal.agentId`
- `sessionId` -> `runId` (task/playbook run)
- `timestamp` -> `createdAtMs`
- `symbol`, `action`, `orderType`, `qty` -> `TradeProposal` + execution overrides
- `price`, `sl`, `tp` -> `entryPrice`, `stopLoss`, `takeProfit`
- `reason` -> `TradeProposal.reason`
- `evidenceRefs` -> `setup.signalId`, `chart snapshot memory id`, `evidence card`

### BrokerAction (broker maintenance)

`BrokerAction` covers close/cancel/modify and refresh operations. These are already normalized and recorded in the ledger.

## Idempotency

Idempotency is enforced using:
- Trade: `computeTradeDedupeKey(...)` in `services/tradeIdentity.ts`
- Broker action: `computeBrokerActionIdempotencyKey(...)` in `services/tradeIdentity.ts`

Ledger reservation is the authoritative dedupe gate:
- `tradeLedger.reserve()` for both trade and broker_action entries
- Fallback in-memory dedupe only if ledger is unavailable

## RiskGate (policy enforcement)

RiskGate denies execution unless all gates pass. Current gates include:
- Kill switch / autopilot disabled
- Max order rate
- Max open positions (global / per-symbol / per-group)
- Max daily loss / loss streak
- Spread limits (percent / ATR)
- Broker constraints (min stop distance, session)

All denials must return stable codes (see below) and be logged as `trade_blocked`.

## OMS (order state machine)

Ledger entries represent canonical order state:
- SUBMITTING -> ACCEPTED -> OPEN -> CLOSED
- REJECTED / CANCELLED terminal states

Reconciliation updates ledger based on broker snapshots and order/position stream data.

## BrokerAdapter

Broker calls must be normalized and error-classified before returning to the UI/agent.
The adapter is the only module that directly invokes broker APIs.

## Ledger + Audit Events

Every step emits audit events (truth ledger):
- TRADE_COMMAND_RECEIVED
- RISK_DECISION
- OMS_TRANSITION
- BROKER_REQUEST
- BROKER_RESPONSE
- RECONCILE_RESULT
- AUTOPILOT_STATE_CHANGED

## Stable Error Codes

These codes are used across ExecutionAPI, UI notifications, and audit events:
- KILL_SWITCH_ON
- AUTOPILOT_DISABLED
- BROKER_AUTH_INVALID
- STREAM_UNHEALTHY
- STALE_MARKET_DATA
- RATE_LIMIT_BACKOFF
- EXPOSURE_LIMIT
- ORDER_RATE_LIMIT
- SYMBOL_NOT_ALLOWED
- OMS_RECONCILING
- BROKER_TIMEOUT
- BROKER_REJECTED
- INTERNAL_ERROR

## Correlation IDs

Each TradeCommand or BrokerAction should carry a single correlation id:
- chat message id -> tool call id -> task tree run id -> audit events -> UI

This makes postmortems and replay deterministic.
