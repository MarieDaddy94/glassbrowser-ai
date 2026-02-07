<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run GlassBrowser AI (Desktop)

This repo now runs as an Electron desktop app with the same UI, but a real Chromium browser pane.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `OPENAI_API_KEY` in [.env.local](.env.local) to your GPT‑5.2 key.  
   (Optional) Set `GEMINI_API_KEY` only if you want Live Voice/TTS features for now.
3. Run the desktop app:
   `npm run electron:dev`

## Build Installer

- Unpacked build: `npm run electron:pack`
- Windows installer: `npm run electron:dist` (outputs to `release/`)

## Agent Research Tool (Backtest Optimization)

GlassBrowser AI agents can now run headless backtest grid searches (no UI clicks) using broker history.

Requirements:
- TradeLocker connected
- Symbol must resolve to a TradeLocker instrument

Example prompt:
```
Optimize RANGE_BREAKOUT on XAUUSD, 15m, last 90 days, session 8-10 UTC.
Grid: lookback [10,20], atrMult [1.0,1.5,2.0], rr [1.5,2.0], breakoutMode [close, wick].
```

What you should see:
- Chat shows a tool card: "Backtest Optimization" with status updates
- Agent response lists top configs (Net R, Win Rate, Profit Factor, Trades)
- An agent memory entry is stored with kind `backtest_optimization`

Validation checklist:
1. Connect TradeLocker in the app.
2. Open Chat and run the example prompt above.
3. Confirm tool output includes top configs and a summary line.
4. Open Memory panel and filter kind `backtest_optimization` to confirm it was saved.

## MT5 Tick Stream (Optional)

The MT5 panel can connect to a local FastAPI WebSocket bridge to stream real ticks from your installed MetaTrader 5 terminal.

1. Install Python deps:
   `python -m pip install -r backend/requirements.txt`
2. Start the bridge:
   `python backend/mt5_bridge/app.py`
3. In the app: open **MT5** panel → **Connect** → subscribe to symbols.

Bridge docs: `backend/README.md`
