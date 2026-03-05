# Enterprise Upgrade Gates (0.1.279 -> 0.1.284)

This document defines release blockers and SLO targets for the enterprise hardening roadmap.

## Global Release Blockers

- `npm run release:validate` must pass.
- `npm test -- --runInBand` must pass.
- `npm run audit:baseline` must produce `artifacts/enterprise-baseline.json`.
- Installer smoke must pass for current release target.

## Phase 0 Gate (Baseline + Flags)

- Baseline artifact includes:
  - app complexity metrics
  - IPC surface by scope
  - webview usage map
  - sidecar lifecycle map
- Feature flags are defined and readable at runtime:
  - `securityAuditV1`
  - `mt5BridgeAuthV1`
  - `zustandMigrationV1`
  - `uiVirtualizationV1`
  - `electronE2EV1`

## Phase 1 Gate (Electron Security Closure)

- BrowserWindow and attached webviews enforce secure webPreferences.
- CSP is injected for packaged and dev modes.
- IPC sender validation is mandatory in wrapper path.
- Security snapshot endpoint exists and returns non-empty audit report.

## Phase 2 Gate (Python Sidecar Hardening)

- Bridge auth token is required by REST and WS.
- `/heartbeat` is implemented and validated by main process.
- Lifecycle IPC exists:
  - `mt5Bridge:heartbeat`
  - `mt5Bridge:lifecycleStatus`
  - `mt5Bridge:forceRestart`
- Sidecar restart policy handles unresponsive process states with bounded retries.

## Phase 3 Gate (Test + CI Maturity)

- Windows + Ubuntu CI lanes run and pass.
- Electron E2E smoke exists and runs in CI.
- Python tests run in CI (`pytest`) and dependency audit runs (`pip-audit`).

## Phase 4 Gate (Architecture Decomposition)

- Feature stores exist under `stores/`.
- `App.tsx` orchestration responsibilities are reduced in migration waves.
- Domain interfaces exist under `services/domain/`.

## Phase 5 Gate (Performance)

- Virtualized lists applied to high-cardinality panels.
- Render/update telemetry includes fps and dropped-frame snapshots.
- Performance budgets documented and checked in release validation.

## Phase 6 Gate (Resilience + Maintenance)

- Chaos/failure test pack exists and runs in CI/nightly.
- Operational runbook and recovery guidance are documented and current.
- Dependency security audits are automated for Node and Python.
