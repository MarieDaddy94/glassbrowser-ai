# MT5 Tick Bridge (FastAPI)

This folder contains a local FastAPI WebSocket bridge that connects to your installed MetaTrader 5 terminal (via the `MetaTrader5` Python package) and streams ticks to the Electron app.

## Install

```powershell
python -m pip install -r backend/requirements.txt
```

## Configure (optional)

If you want the bridge to start/login MT5 automatically, set environment variables:

- `MT5_PATH` (optional) path to your MT5 `terminal64.exe`
- `MT5_LOGIN` (optional) account login ID
- `MT5_PASSWORD` (optional) account password
- `MT5_SERVER` (optional) server name (broker-specific)

If you already have MT5 running and logged in, you can usually omit these and just start the bridge.

## Run

```powershell
python backend/mt5_bridge/app.py
```

Default endpoints:

- `GET http://127.0.0.1:8001/health`
- `GET http://127.0.0.1:8001/account`
- `WS  ws://127.0.0.1:8001/ws/ticks`

## WebSocket Messages

Client → server:

- `{"type":"set_subscriptions","symbols":["EURUSD","XAUUSD"]}`
- `{"type":"list_symbols","query":"EURUSD","limit":50,"request_id":"abc"}`

Server → client:

- `{"type":"tick", ...}`
- `{"type":"subscriptions","symbols":[...]}`
- `{"type":"symbol_resolved","requested":"EURUSD","symbol":"EURUSD.sim"}`
- `{"type":"symbol_error","symbol":"EURUSD","suggestions":[...],"last_error":{...}}`
