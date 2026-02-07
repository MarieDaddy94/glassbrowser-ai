from __future__ import annotations

import asyncio
import json
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, Set

from fastapi import Body, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

try:
    import MetaTrader5 as mt5
except Exception:  # pragma: no cover
    mt5 = None


def _clamp_int(value: Any, default: int, min_value: int, max_value: int) -> int:
    try:
        n = int(value)
    except Exception:
        return default
    return max(min_value, min(max_value, n))


def _env_int(name: str) -> Optional[int]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def _env_str(name: str) -> Optional[str]:
    raw = os.getenv(name, "")
    raw = raw.strip()
    return raw or None


def _mt5_last_error() -> Dict[str, Any]:
    if mt5 is None:
        return {"code": None, "message": "MetaTrader5 package not installed"}
    try:
        code, message = mt5.last_error()
        return {"code": code, "message": message}
    except Exception as exc:  # pragma: no cover
        return {"code": None, "message": str(exc)}


def _tick_to_dict(symbol: str, tick: Any) -> Dict[str, Any]:
    bid = _to_float(getattr(tick, "bid", None))
    ask = _to_float(getattr(tick, "ask", None))
    mid = None
    spread = None
    if isinstance(bid, (int, float)) and isinstance(ask, (int, float)):
        spread = ask - bid
        mid = (bid + ask) / 2
    return {
        "type": "tick",
        "symbol": symbol,
        "time": _to_int(getattr(tick, "time", None)),
        "time_msc": _to_int(getattr(tick, "time_msc", None)),
        "bid": bid,
        "ask": ask,
        "mid": mid,
        "last": _to_float(getattr(tick, "last", None)),
        "volume": _to_float(getattr(tick, "volume", None)),
        "volume_real": _to_float(getattr(tick, "volume_real", None)),
        "flags": _to_int(getattr(tick, "flags", None)),
        "spread": spread,
        "local_ts_ms": int(time.time() * 1000),
    }


def _normalize_symbol(symbol: str) -> str:
    return "".join(ch for ch in symbol.upper() if ch.isalnum())


def _dedupe_keep_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        out.append(item)
    return out


def _to_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        num = float(value)
    except Exception:
        return None
    return num if num == num else None


def _to_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except Exception:
        return None


def _normalize_side(value: Any) -> str:
    raw = str(value or "").strip().upper()
    if raw in ("SELL", "SHORT", "S"):
        return "SELL"
    return "BUY"


def _normalize_order_type(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if raw in ("limit", "lmt"):
        return "limit"
    if raw in ("stop", "stp"):
        return "stop"
    return "market"


MT5_TIMEFRAMES: Dict[str, Any] = {
    "1m": getattr(mt5, "TIMEFRAME_M1", None),
    "5m": getattr(mt5, "TIMEFRAME_M5", None),
    "15m": getattr(mt5, "TIMEFRAME_M15", None),
    "30m": getattr(mt5, "TIMEFRAME_M30", None),
    "1h": getattr(mt5, "TIMEFRAME_H1", None),
    "4h": getattr(mt5, "TIMEFRAME_H4", None),
    "1d": getattr(mt5, "TIMEFRAME_D1", None),
}


def _normalize_resolution(value: Any) -> Optional[str]:
    raw = str(value or "").strip()
    if not raw:
        return None
    lowered = raw.lower()
    if lowered in MT5_TIMEFRAMES:
        return lowered
    if lowered and lowered[0] in ("m", "h", "d") and lowered[1:].isdigit():
        return f"{lowered[1:]}{lowered[0]}"
    if lowered.isdigit():
        if lowered == "60":
            return "1h"
        if lowered in ("1", "5", "15", "30"):
            return f"{lowered}m"
    return None


def _parse_timestamp(value: Any) -> Optional[datetime]:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        ts = float(value)
    else:
        raw = str(value).strip()
        if not raw:
            return None
        try:
            ts = float(raw)
        except Exception:
            try:
                return datetime.fromisoformat(raw)
            except Exception:
                return None
    if ts > 1e12:
        ts = ts / 1000.0
    try:
        return datetime.fromtimestamp(ts)
    except Exception:
        return None


def _as_dict(obj: Any) -> Dict[str, Any]:
    if hasattr(obj, "_asdict"):
        return obj._asdict()
    return {"raw": str(obj)}


@dataclass(eq=False)
class ClientState:
    websocket: WebSocket
    subscriptions: Set[str] = field(default_factory=set)


class Mt5TickHub:
    def __init__(self) -> None:
        self._clients: Set[ClientState] = set()
        self._clients_lock = asyncio.Lock()
        self._mt5_lock = asyncio.Lock()
        self._last_time_msc_by_symbol: Dict[str, int] = {}
        self._last_tick_by_symbol: Dict[str, Dict[str, Any]] = {}
        self._poll_task: Optional[asyncio.Task] = None
        self._poll_interval_ms = max(25, _env_int("MT5_POLL_INTERVAL_MS") or 150)

    async def start(self) -> None:
        if self._poll_task:
            return
        self._poll_task = asyncio.create_task(self._poll_loop())

    async def stop(self) -> None:
        if self._poll_task:
            self._poll_task.cancel()
            try:
                await self._poll_task
            except Exception:
                pass
            self._poll_task = None

    async def register(self, websocket: WebSocket) -> ClientState:
        client = ClientState(websocket=websocket)
        async with self._clients_lock:
            self._clients.add(client)
        return client

    async def unregister(self, client: ClientState) -> None:
        async with self._clients_lock:
            self._clients.discard(client)

    async def set_subscriptions(self, client: ClientState, symbols: Set[str]) -> None:
        cleaned = {s.strip() for s in symbols if s and s.strip()}
        client.subscriptions = cleaned

    async def add_subscriptions(self, client: ClientState, symbols: Set[str]) -> None:
        cleaned = {s.strip() for s in symbols if s and s.strip()}
        client.subscriptions |= cleaned

    async def remove_subscriptions(self, client: ClientState, symbols: Set[str]) -> None:
        cleaned = {s.strip() for s in symbols if s and s.strip()}
        client.subscriptions -= cleaned

    async def _all_subscribed_symbols(self) -> Set[str]:
        async with self._clients_lock:
            symbols: Set[str] = set()
            for client in self._clients:
                symbols |= client.subscriptions
            return symbols

    async def _broadcast(self, message: Dict[str, Any], only_symbol: Optional[str] = None) -> None:
        payload = json.dumps(message)
        async with self._clients_lock:
            clients = list(self._clients)
        if not clients:
            return
        for client in clients:
            if only_symbol and only_symbol not in client.subscriptions:
                continue
            try:
                await client.websocket.send_text(payload)
            except Exception:
                # Let disconnect handler clean it up.
                pass

    async def _ensure_symbol(self, symbol: str) -> bool:
        if mt5 is None:
            return False
        async with self._mt5_lock:
            info = mt5.symbol_info(symbol)
            if info is None:
                return False
            if getattr(info, "visible", False):
                return True
            return bool(mt5.symbol_select(symbol, True))

    async def get_quote(self, symbol: str) -> tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
        if mt5 is None:
            return None, _mt5_last_error()

        sym = (symbol or "").strip()
        if not sym:
            return None, _mt5_last_error()

        ok = await self._ensure_symbol(sym)
        if not ok:
            return None, _mt5_last_error()

        async with self._mt5_lock:
            if not mt5.initialize():
                return None, _mt5_last_error()
            tick = mt5.symbol_info_tick(sym)

        if tick is None:
            return None, _mt5_last_error()

        payload = _tick_to_dict(sym, tick)
        self._last_tick_by_symbol[sym] = payload
        return payload, _mt5_last_error()

    async def resolve_symbol(self, requested: str) -> tuple[Optional[str], list[str], Dict[str, Any]]:
        if mt5 is None:
            return None, [], _mt5_last_error()

        raw = (requested or "").strip()
        if not raw:
            return None, [], _mt5_last_error()

        req_up = raw.upper()
        req_norm = _normalize_symbol(raw)

        async with self._mt5_lock:
            if not mt5.initialize():
                return None, [], _mt5_last_error()

            for variant in _dedupe_keep_order([raw, raw.upper(), raw.lower()]):
                info = mt5.symbol_info(variant)
                if info is None:
                    continue
                if not getattr(info, "visible", False):
                    mt5.symbol_select(variant, True)
                return variant, [], _mt5_last_error()

            candidates: list[Any] = []
            patterns = _dedupe_keep_order(
                [
                    f"{req_up}*",
                    f"*{req_up}*",
                    f"{raw}*",
                    f"*{raw}*",
                    f"{raw.lower()}*",
                    f"*{raw.lower()}*",
                ]
            )
            for pattern in patterns:
                res = mt5.symbols_get(pattern)
                if res:
                    candidates.extend(list(res))
                    break

            if not candidates and req_norm:
                # Fall back to a full scan for case-insensitive matching.
                res = mt5.symbols_get()
                if res:
                    candidates.extend(list(res))

            if not candidates:
                return None, [], _mt5_last_error()

            scored: list[tuple[int, str]] = []
            suggestions: list[str] = []
            for cand in candidates[:5000]:
                name = getattr(cand, "name", None)
                if not name:
                    continue
                name = str(name)

                cand_upper = name.upper()
                cand_norm = _normalize_symbol(name)
                if req_norm and req_norm not in cand_norm and not cand_norm.startswith(req_norm):
                    continue
                suggestions.append(name)

                score = 0
                if cand_upper == req_up:
                    score += 1000
                if req_norm and cand_norm == req_norm:
                    score += 900
                if req_norm and cand_norm.startswith(req_norm):
                    score += 850
                if cand_upper.startswith(req_up):
                    score += 800
                if getattr(cand, "visible", False):
                    score += 10

                path = getattr(cand, "path", "") or ""
                if isinstance(path, str) and "FOREX" in path.upper():
                    score += 3

                scored.append((score, name))

            if not scored:
                return None, _dedupe_keep_order(suggestions)[:8], _mt5_last_error()

            scored.sort(key=lambda t: (-t[0], len(t[1]), t[1]))
            best_name = scored[0][1]

            best_info = mt5.symbol_info(best_name)
            if best_info is not None and not getattr(best_info, "visible", False):
                mt5.symbol_select(best_name, True)

            return best_name, _dedupe_keep_order(suggestions)[:8], _mt5_last_error()

    async def list_symbols(self, query: str | None, limit: Any = None) -> tuple[list[str], Dict[str, Any]]:
        if mt5 is None:
            return [], _mt5_last_error()

        q = (query or "").strip()
        lim = _clamp_int(limit, default=80, min_value=1, max_value=500)

        async with self._mt5_lock:
            if not mt5.initialize():
                return [], _mt5_last_error()

            group = None
            if q:
                q_up = q.upper()
                if "*" in q_up or "?" in q_up:
                    group = q_up
                else:
                    group = f"*{q_up}*"

            res = mt5.symbols_get(group) if group else mt5.symbols_get()
            if not res:
                return [], _mt5_last_error()

            names: list[str] = []
            for item in res[:5000]:
                name = getattr(item, "name", None)
                if name:
                    names.append(str(name))

            names = sorted(set(names))
            return names[:lim], _mt5_last_error()

    async def _poll_loop(self) -> None:
        while True:
            try:
                symbols = await self._all_subscribed_symbols()
                if not symbols or mt5 is None:
                    await asyncio.sleep(self._poll_interval_ms / 1000)
                    continue

                for symbol in symbols:
                    try:
                        ok = await self._ensure_symbol(symbol)
                        if not ok:
                            await self._broadcast(
                                {
                                    "type": "symbol_error",
                                    "symbol": symbol,
                                    "message": "Unknown or unavailable symbol",
                                    "last_error": _mt5_last_error(),
                                },
                                only_symbol=symbol,
                            )
                            continue

                        async with self._mt5_lock:
                            tick = mt5.symbol_info_tick(symbol)
                        if tick is None:
                            continue

                        time_msc = getattr(tick, "time_msc", None)
                        if not isinstance(time_msc, int):
                            continue

                        last_time_msc = self._last_time_msc_by_symbol.get(symbol)
                        if last_time_msc is not None and time_msc <= last_time_msc:
                            continue

                        self._last_time_msc_by_symbol[symbol] = time_msc
                        payload = _tick_to_dict(symbol, tick)
                        self._last_tick_by_symbol[symbol] = payload
                        await self._broadcast(payload, only_symbol=symbol)
                    except Exception as exc:
                        await self._broadcast({"type": "error", "message": str(exc)})

                await asyncio.sleep(self._poll_interval_ms / 1000)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                await self._broadcast({"type": "error", "message": str(exc)})
                await asyncio.sleep(1.0)


def _init_mt5() -> Dict[str, Any]:
    if mt5 is None:
        return {"ok": False, "error": "MetaTrader5 package not available", "last_error": _mt5_last_error()}

    path = _env_str("MT5_PATH")
    login = _env_int("MT5_LOGIN")
    password = _env_str("MT5_PASSWORD")
    server = _env_str("MT5_SERVER")

    kwargs: Dict[str, Any] = {}
    if path:
        kwargs["path"] = path
    if login is not None:
        kwargs["login"] = login
    if password is not None:
        kwargs["password"] = password
    if server is not None:
        kwargs["server"] = server

    ok = bool(mt5.initialize(**kwargs))
    if not ok:
        return {"ok": False, "error": "mt5.initialize() failed", "last_error": _mt5_last_error()}

    return {"ok": True}


app = FastAPI(title="GlassBrowser MT5 Bridge", version="0.1.0")
hub = Mt5TickHub()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup() -> None:
    await hub.start()
    # Initialize MT5 once at boot; users can still run the terminal manually.
    if mt5 is not None:
        async with hub._mt5_lock:
            _init_mt5()


@app.on_event("shutdown")
async def _shutdown() -> None:
    await hub.stop()
    if mt5 is not None:
        async with hub._mt5_lock:
            try:
                mt5.shutdown()
            except Exception:
                pass


@app.get("/health")
async def health() -> JSONResponse:
    # Keep this endpoint lightweight and always 200 if the server is up.
    # (Electron uses this to detect whether the bridge is running.)
    return JSONResponse({"ok": True, "mt5": {"available": mt5 is not None}})


@app.get("/account")
async def account() -> JSONResponse:
    if mt5 is None:
        return JSONResponse({"ok": False, "error": "MetaTrader5 package not available"}, status_code=500)

    async with hub._mt5_lock:
        if not mt5.initialize():
            return JSONResponse(
                {"ok": False, "error": "MT5 not initialized", "last_error": _mt5_last_error()},
                status_code=500,
            )

        acc = mt5.account_info()
        if acc is None:
            return JSONResponse(
                {"ok": False, "error": "No account info", "last_error": _mt5_last_error()},
                status_code=500,
            )

    data = acc._asdict() if hasattr(acc, "_asdict") else {"raw": str(acc)}
    # Never return passwords; MetaTrader5 doesn't include it anyway.
    return JSONResponse({"ok": True, "account": data})


@app.get("/symbols")
async def symbols(query: Optional[str] = None, limit: Optional[int] = None) -> JSONResponse:
    names, last_error = await hub.list_symbols(query, limit)
    return JSONResponse({"ok": True, "symbols": names, "last_error": last_error})


@app.get("/quote")
async def quote(symbol: str) -> JSONResponse:
    if not symbol:
        return JSONResponse({"ok": False, "error": "Symbol is required"}, status_code=400)

    resolved, suggestions, last_error = await hub.resolve_symbol(symbol)
    if not resolved:
        return JSONResponse(
            {
                "ok": False,
                "error": "Symbol not found",
                "requested": symbol,
                "suggestions": suggestions,
                "last_error": last_error,
            },
            status_code=404,
        )

    quote_payload, quote_error = await hub.get_quote(resolved)
    if quote_payload is None:
        return JSONResponse(
            {
                "ok": False,
                "error": "Quote unavailable",
                "requested": symbol,
                "resolved": resolved,
                "last_error": quote_error,
            },
            status_code=500,
        )

    return JSONResponse(
        {
            "ok": True,
            "requested": symbol,
            "resolved": resolved,
            "quote": quote_payload,
            "last_error": quote_error,
        }
    )


@app.get("/quotes")
async def quotes(symbols: Optional[str] = None) -> JSONResponse:
    raw = (symbols or "").strip()
    if not raw:
        return JSONResponse({"ok": False, "error": "Symbols are required"}, status_code=400)

    requested = [s.strip() for s in raw.split(",") if s and s.strip()]
    if not requested:
        return JSONResponse({"ok": False, "error": "Symbols are required"}, status_code=400)

    results = []
    for symbol in requested:
        resolved, suggestions, last_error = await hub.resolve_symbol(symbol)
        if not resolved:
            results.append(
                {
                    "ok": False,
                    "requested": symbol,
                    "error": "Symbol not found",
                    "suggestions": suggestions,
                    "last_error": last_error,
                }
            )
            continue

        quote_payload, quote_error = await hub.get_quote(resolved)
        if quote_payload is None:
            results.append(
                {
                    "ok": False,
                    "requested": symbol,
                    "resolved": resolved,
                    "error": "Quote unavailable",
                    "last_error": quote_error,
                }
            )
            continue

        results.append(
            {
                "ok": True,
                "requested": symbol,
                "resolved": resolved,
                "quote": quote_payload,
                "last_error": quote_error,
            }
        )

    return JSONResponse({"ok": True, "quotes": results})


@app.get("/positions")
async def positions(symbol: Optional[str] = None) -> JSONResponse:
    if mt5 is None:
        return JSONResponse({"ok": False, "error": "MetaTrader5 package not available"}, status_code=500)

    async with hub._mt5_lock:
        if not mt5.initialize():
            return JSONResponse(
                {"ok": False, "error": "MT5 not initialized", "last_error": _mt5_last_error()},
                status_code=500,
            )

        res = mt5.positions_get(symbol=symbol) if symbol else mt5.positions_get()
        if res is None:
            return JSONResponse(
                {"ok": False, "error": "Failed to fetch positions", "last_error": _mt5_last_error()},
                status_code=500,
            )

    return JSONResponse({"ok": True, "positions": [_as_dict(p) for p in res]})


@app.get("/orders")
async def orders(symbol: Optional[str] = None) -> JSONResponse:
    if mt5 is None:
        return JSONResponse({"ok": False, "error": "MetaTrader5 package not available"}, status_code=500)

    async with hub._mt5_lock:
        if not mt5.initialize():
            return JSONResponse(
                {"ok": False, "error": "MT5 not initialized", "last_error": _mt5_last_error()},
                status_code=500,
            )

        res = mt5.orders_get(symbol=symbol) if symbol else mt5.orders_get()
        if res is None:
            return JSONResponse(
                {"ok": False, "error": "Failed to fetch orders", "last_error": _mt5_last_error()},
                status_code=500,
            )

    return JSONResponse({"ok": True, "orders": [_as_dict(o) for o in res]})


@app.get("/history")
async def history(
    days: Optional[int] = None,
    limit: Optional[int] = None,
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
) -> JSONResponse:
    if mt5 is None:
        return JSONResponse({"ok": False, "error": "MetaTrader5 package not available"}, status_code=500)

    days_value = _clamp_int(days, default=30, min_value=1, max_value=365)
    lim = _clamp_int(limit, default=400, min_value=1, max_value=2000)
    from_dt = _parse_timestamp(from_ts)
    to_dt = _parse_timestamp(to_ts)
    if to_dt is None:
        to_dt = datetime.now()
    if from_dt is None:
        from_dt = to_dt - timedelta(days=days_value)

    async with hub._mt5_lock:
        if not mt5.initialize():
            return JSONResponse(
                {"ok": False, "error": "MT5 not initialized", "last_error": _mt5_last_error()},
                status_code=500,
            )

        res = mt5.history_deals_get(from_dt, to_dt)
        if res is None:
            return JSONResponse(
                {"ok": False, "error": "Failed to fetch history", "last_error": _mt5_last_error()},
                status_code=500,
            )

    deals = [_as_dict(d) for d in res]
    if len(deals) > lim:
        deals = deals[-lim:]
    return JSONResponse({"ok": True, "deals": deals, "from": from_dt.isoformat(), "to": to_dt.isoformat()})


@app.post("/history/series")
async def history_series(payload: Dict[str, Any] = Body(...)) -> JSONResponse:
    if mt5 is None:
        return JSONResponse({"ok": False, "error": "MetaTrader5 package not available"}, status_code=500)

    symbol = str(payload.get("symbol") or "").strip()
    if not symbol:
        return JSONResponse({"ok": False, "error": "Symbol is required"}, status_code=400)

    resolution_raw = payload.get("resolution") or payload.get("timeframe") or payload.get("interval")
    resolution = _normalize_resolution(resolution_raw)
    if not resolution:
        return JSONResponse({"ok": False, "error": "Resolution is required"}, status_code=400)

    timeframe = MT5_TIMEFRAMES.get(resolution)
    if timeframe is None:
        return JSONResponse({"ok": False, "error": "Unsupported resolution"}, status_code=400)

    from_dt = _parse_timestamp(payload.get("from") or payload.get("from_ts"))
    to_dt = _parse_timestamp(payload.get("to") or payload.get("to_ts"))
    if to_dt is None:
        to_dt = datetime.now()
    if from_dt is None:
        from_dt = to_dt - timedelta(days=7)
    if from_dt >= to_dt:
        from_dt = to_dt - timedelta(days=7)

    limit = _clamp_int(payload.get("limit"), default=2000, min_value=50, max_value=10000)

    async with hub._mt5_lock:
        if not mt5.initialize():
            return JSONResponse(
                {"ok": False, "error": "MT5 not initialized", "last_error": _mt5_last_error()},
                status_code=500,
            )

        info = mt5.symbol_info(symbol)
        if info is None:
            return JSONResponse({"ok": False, "error": "Unknown symbol", "last_error": _mt5_last_error()}, status_code=400)
        if not getattr(info, "visible", False):
            mt5.symbol_select(symbol, True)

        rates = mt5.copy_rates_range(symbol, timeframe, from_dt, to_dt)

    if rates is None:
        return JSONResponse({"ok": False, "error": "Failed to fetch bars", "last_error": _mt5_last_error()}, status_code=500)

    def _bar_value(bar: Any, key: str) -> Any:
        if isinstance(bar, dict):
            return bar.get(key)
        if hasattr(bar, key):
            return getattr(bar, key)
        try:
            return bar[key]
        except Exception:
            return None

    bars: list[Dict[str, Any]] = []
    for bar in rates:
        ts = _bar_value(bar, "time")
        if ts is None:
            continue
        open_v = _to_float(_bar_value(bar, "open"))
        high_v = _to_float(_bar_value(bar, "high"))
        low_v = _to_float(_bar_value(bar, "low"))
        close_v = _to_float(_bar_value(bar, "close"))
        volume_v = _to_int(_bar_value(bar, "tick_volume"))
        bars.append(
            {
                "t": int(ts) * 1000,
                "o": open_v,
                "h": high_v,
                "l": low_v,
                "c": close_v,
                "v": volume_v,
            }
        )

    if len(bars) > limit:
        bars = bars[-limit:]

    return JSONResponse({"ok": True, "bars": bars, "fetchedAtMs": int(time.time() * 1000), "source": "mt5"})


@app.post("/order")
async def place_order(payload: Dict[str, Any] = Body(...)) -> JSONResponse:
    if mt5 is None:
        return JSONResponse({"ok": False, "error": "MetaTrader5 package not available"}, status_code=500)

    symbol = str(payload.get("symbol") or "").strip()
    if not symbol:
        return JSONResponse({"ok": False, "error": "Symbol is required"}, status_code=400)

    side = _normalize_side(payload.get("side"))
    order_type = _normalize_order_type(payload.get("type"))
    volume = _to_float(payload.get("volume") or payload.get("qty"))
    if volume is None or volume <= 0:
        return JSONResponse({"ok": False, "error": "Volume is required"}, status_code=400)

    price = _to_float(payload.get("price"))
    sl = _to_float(payload.get("sl") or payload.get("stopLoss"))
    tp = _to_float(payload.get("tp") or payload.get("takeProfit"))
    deviation = _to_int(payload.get("deviation")) or _clamp_int(os.getenv("MT5_DEVIATION"), default=20, min_value=1, max_value=500)
    magic = _to_int(payload.get("magic"))
    comment = str(payload.get("comment") or "").strip()

    async with hub._mt5_lock:
        if not mt5.initialize():
            return JSONResponse(
                {"ok": False, "error": "MT5 not initialized", "last_error": _mt5_last_error()},
                status_code=500,
            )

        info = mt5.symbol_info(symbol)
        if info is None:
            return JSONResponse({"ok": False, "error": "Unknown symbol", "last_error": _mt5_last_error()}, status_code=400)
        if not getattr(info, "visible", False):
            mt5.symbol_select(symbol, True)

        if order_type == "market":
            tick = mt5.symbol_info_tick(symbol)
            if tick is None:
                return JSONResponse(
                    {"ok": False, "error": "No tick data", "last_error": _mt5_last_error()},
                    status_code=500,
                )
            price = float(tick.ask if side == "BUY" else tick.bid)
            mt5_type = mt5.ORDER_TYPE_BUY if side == "BUY" else mt5.ORDER_TYPE_SELL
            action = mt5.TRADE_ACTION_DEAL
        elif order_type == "limit":
            if price is None:
                return JSONResponse({"ok": False, "error": "Limit price is required"}, status_code=400)
            mt5_type = mt5.ORDER_TYPE_BUY_LIMIT if side == "BUY" else mt5.ORDER_TYPE_SELL_LIMIT
            action = mt5.TRADE_ACTION_PENDING
        else:
            if price is None:
                return JSONResponse({"ok": False, "error": "Stop price is required"}, status_code=400)
            mt5_type = mt5.ORDER_TYPE_BUY_STOP if side == "BUY" else mt5.ORDER_TYPE_SELL_STOP
            action = mt5.TRADE_ACTION_PENDING

        request: Dict[str, Any] = {
            "action": action,
            "symbol": symbol,
            "volume": volume,
            "type": mt5_type,
            "price": price,
            "deviation": deviation,
        }
        if sl is not None:
            request["sl"] = sl
        if tp is not None:
            request["tp"] = tp
        if magic is not None:
            request["magic"] = magic
        if comment:
            request["comment"] = comment

        result = mt5.order_send(request)

    if result is None:
        return JSONResponse({"ok": False, "error": "Order send failed", "last_error": _mt5_last_error()}, status_code=500)

    data = _as_dict(result)
    retcode = data.get("retcode")
    ok = retcode in (
        getattr(mt5, "TRADE_RETCODE_DONE", None),
        getattr(mt5, "TRADE_RETCODE_PLACED", None),
        getattr(mt5, "TRADE_RETCODE_DONE_PARTIAL", None),
    )
    if ok:
        return JSONResponse({"ok": True, "result": data})
    return JSONResponse({"ok": False, "error": "Order rejected", "result": data, "last_error": _mt5_last_error()}, status_code=400)


@app.post("/order/cancel")
async def cancel_order(payload: Dict[str, Any] = Body(...)) -> JSONResponse:
    if mt5 is None:
        return JSONResponse({"ok": False, "error": "MetaTrader5 package not available"}, status_code=500)

    order_id = _to_int(payload.get("order") or payload.get("order_id") or payload.get("ticket"))
    if order_id is None:
        return JSONResponse({"ok": False, "error": "Order id is required"}, status_code=400)

    async with hub._mt5_lock:
        if not mt5.initialize():
            return JSONResponse(
                {"ok": False, "error": "MT5 not initialized", "last_error": _mt5_last_error()},
                status_code=500,
            )

        request = {"action": mt5.TRADE_ACTION_REMOVE, "order": order_id}
        result = mt5.order_send(request)

    if result is None:
        return JSONResponse({"ok": False, "error": "Cancel failed", "last_error": _mt5_last_error()}, status_code=500)

    data = _as_dict(result)
    retcode = data.get("retcode")
    ok = retcode in (
        getattr(mt5, "TRADE_RETCODE_DONE", None),
        getattr(mt5, "TRADE_RETCODE_PLACED", None),
    )
    if ok:
        return JSONResponse({"ok": True, "result": data})
    return JSONResponse({"ok": False, "error": "Cancel rejected", "result": data, "last_error": _mt5_last_error()}, status_code=400)


@app.post("/order/modify")
async def modify_order(payload: Dict[str, Any] = Body(...)) -> JSONResponse:
    if mt5 is None:
        return JSONResponse({"ok": False, "error": "MetaTrader5 package not available"}, status_code=500)

    order_id = _to_int(payload.get("order") or payload.get("order_id") or payload.get("ticket"))
    if order_id is None:
        return JSONResponse({"ok": False, "error": "Order id is required"}, status_code=400)

    price = _to_float(payload.get("price"))
    sl = _to_float(payload.get("sl") or payload.get("stopLoss"))
    tp = _to_float(payload.get("tp") or payload.get("takeProfit"))
    if price is None and sl is None and tp is None:
        return JSONResponse({"ok": False, "error": "Nothing to update"}, status_code=400)

    async with hub._mt5_lock:
        if not mt5.initialize():
            return JSONResponse(
                {"ok": False, "error": "MT5 not initialized", "last_error": _mt5_last_error()},
                status_code=500,
            )

        orders = mt5.orders_get(ticket=order_id)
        if not orders:
            return JSONResponse(
                {"ok": False, "error": "Order not found", "last_error": _mt5_last_error()},
                status_code=404,
            )

        order = orders[0]
        symbol = getattr(order, "symbol", None)
        if not symbol:
            return JSONResponse({"ok": False, "error": "Order symbol missing"}, status_code=400)

        current_price = _to_float(getattr(order, "price_open", None))
        current_sl = _to_float(getattr(order, "sl", None))
        current_tp = _to_float(getattr(order, "tp", None))

        final_price = price if price is not None else current_price
        if final_price is None:
            return JSONResponse({"ok": False, "error": "Order price missing"}, status_code=400)

        request: Dict[str, Any] = {
            "action": mt5.TRADE_ACTION_MODIFY,
            "order": order_id,
            "symbol": symbol,
            "price": final_price,
        }
        if sl is not None:
            request["sl"] = sl
        elif current_sl is not None:
            request["sl"] = current_sl
        if tp is not None:
            request["tp"] = tp
        elif current_tp is not None:
            request["tp"] = current_tp

        result = mt5.order_send(request)

    if result is None:
        return JSONResponse({"ok": False, "error": "Modify failed", "last_error": _mt5_last_error()}, status_code=500)

    data = _as_dict(result)
    retcode = data.get("retcode")
    ok = retcode in (
        getattr(mt5, "TRADE_RETCODE_DONE", None),
        getattr(mt5, "TRADE_RETCODE_PLACED", None),
        getattr(mt5, "TRADE_RETCODE_DONE_PARTIAL", None),
    )
    if ok:
        return JSONResponse({"ok": True, "result": data})
    return JSONResponse({"ok": False, "error": "Modify rejected", "result": data, "last_error": _mt5_last_error()}, status_code=400)


@app.post("/position/close")
async def close_position(payload: Dict[str, Any] = Body(...)) -> JSONResponse:
    if mt5 is None:
        return JSONResponse({"ok": False, "error": "MetaTrader5 package not available"}, status_code=500)

    position_id = _to_int(payload.get("position") or payload.get("position_id") or payload.get("ticket"))
    if position_id is None:
        return JSONResponse({"ok": False, "error": "Position id is required"}, status_code=400)

    volume = _to_float(payload.get("volume"))
    deviation = _to_int(payload.get("deviation")) or _clamp_int(os.getenv("MT5_DEVIATION"), default=20, min_value=1, max_value=500)
    magic = _to_int(payload.get("magic"))
    comment = str(payload.get("comment") or "").strip()

    async with hub._mt5_lock:
        if not mt5.initialize():
            return JSONResponse(
                {"ok": False, "error": "MT5 not initialized", "last_error": _mt5_last_error()},
                status_code=500,
            )

        positions = mt5.positions_get(ticket=position_id)
        if not positions:
            return JSONResponse(
                {"ok": False, "error": "Position not found", "last_error": _mt5_last_error()},
                status_code=404,
            )

        pos = positions[0]
        symbol = getattr(pos, "symbol", None)
        if not symbol:
            return JSONResponse({"ok": False, "error": "Position symbol missing"}, status_code=400)

        pos_type = getattr(pos, "type", 0)
        side = "SELL" if int(pos_type) == 0 else "BUY"
        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            return JSONResponse(
                {"ok": False, "error": "No tick data", "last_error": _mt5_last_error()},
                status_code=500,
            )

        price = float(tick.ask if side == "BUY" else tick.bid)
        volume = volume if volume is not None and volume > 0 else float(getattr(pos, "volume", 0.0))
        if volume <= 0:
            return JSONResponse({"ok": False, "error": "Position volume unavailable"}, status_code=400)

        request: Dict[str, Any] = {
            "action": mt5.TRADE_ACTION_DEAL,
            "position": position_id,
            "symbol": symbol,
            "volume": volume,
            "type": mt5.ORDER_TYPE_BUY if side == "BUY" else mt5.ORDER_TYPE_SELL,
            "price": price,
            "deviation": deviation,
        }
        if magic is not None:
            request["magic"] = magic
        if comment:
            request["comment"] = comment

        result = mt5.order_send(request)

    if result is None:
        return JSONResponse({"ok": False, "error": "Close failed", "last_error": _mt5_last_error()}, status_code=500)

    data = _as_dict(result)
    retcode = data.get("retcode")
    ok = retcode in (
        getattr(mt5, "TRADE_RETCODE_DONE", None),
        getattr(mt5, "TRADE_RETCODE_DONE_PARTIAL", None),
    )
    if ok:
        return JSONResponse({"ok": True, "result": data})
    return JSONResponse({"ok": False, "error": "Close rejected", "result": data, "last_error": _mt5_last_error()}, status_code=400)


@app.post("/position/modify")
async def modify_position(payload: Dict[str, Any] = Body(...)) -> JSONResponse:
    if mt5 is None:
        return JSONResponse({"ok": False, "error": "MetaTrader5 package not available"}, status_code=500)

    position_id = _to_int(payload.get("position") or payload.get("position_id") or payload.get("ticket"))
    if position_id is None:
        return JSONResponse({"ok": False, "error": "Position id is required"}, status_code=400)

    sl = _to_float(payload.get("sl") or payload.get("stopLoss"))
    tp = _to_float(payload.get("tp") or payload.get("takeProfit"))
    if sl is None and tp is None:
        return JSONResponse({"ok": False, "error": "Nothing to update"}, status_code=400)

    async with hub._mt5_lock:
        if not mt5.initialize():
            return JSONResponse(
                {"ok": False, "error": "MT5 not initialized", "last_error": _mt5_last_error()},
                status_code=500,
            )

        positions = mt5.positions_get(ticket=position_id)
        if not positions:
            return JSONResponse(
                {"ok": False, "error": "Position not found", "last_error": _mt5_last_error()},
                status_code=404,
            )

        pos = positions[0]
        symbol = getattr(pos, "symbol", None)
        if not symbol:
            return JSONResponse({"ok": False, "error": "Position symbol missing"}, status_code=400)

        current_sl = _to_float(getattr(pos, "sl", None))
        current_tp = _to_float(getattr(pos, "tp", None))

        request: Dict[str, Any] = {
            "action": mt5.TRADE_ACTION_SLTP,
            "position": position_id,
            "symbol": symbol,
        }
        if sl is not None:
            request["sl"] = sl
        elif current_sl is not None:
            request["sl"] = current_sl
        if tp is not None:
            request["tp"] = tp
        elif current_tp is not None:
            request["tp"] = current_tp

        result = mt5.order_send(request)

    if result is None:
        return JSONResponse({"ok": False, "error": "Modify failed", "last_error": _mt5_last_error()}, status_code=500)

    data = _as_dict(result)
    retcode = data.get("retcode")
    ok = retcode in (
        getattr(mt5, "TRADE_RETCODE_DONE", None),
        getattr(mt5, "TRADE_RETCODE_PLACED", None),
        getattr(mt5, "TRADE_RETCODE_DONE_PARTIAL", None),
    )
    if ok:
        return JSONResponse({"ok": True, "result": data})
    return JSONResponse({"ok": False, "error": "Modify rejected", "result": data, "last_error": _mt5_last_error()}, status_code=400)


@app.websocket("/ws/ticks")
async def ws_ticks(websocket: WebSocket) -> None:
    await websocket.accept()

    if mt5 is None:
        await websocket.send_text(json.dumps({"type": "error", "message": "MetaTrader5 package not available"}))
        await websocket.close(code=1011)
        return

    client = await hub.register(websocket)
    try:
        # Send initial status
        await websocket.send_text(json.dumps({"type": "status", "connected": True, "poll_interval_ms": hub._poll_interval_ms}))

        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                await websocket.send_text(json.dumps({"type": "error", "message": "Invalid JSON"}))
                continue

            msg_type = (msg.get("type") or "").strip().lower()
            symbols = msg.get("symbols") or []
            if isinstance(symbols, str):
                symbols = [symbols]
            if not isinstance(symbols, list):
                symbols = []
            sym_set = {str(s) for s in symbols}
            request_id = msg.get("request_id")

            if msg_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong", "t": int(time.time() * 1000)}))
                continue

            if msg_type == "list_symbols":
                query = msg.get("query")
                limit = msg.get("limit")
                symbols_out, last_error = await hub.list_symbols(query=query, limit=limit)
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "symbols",
                            "query": (query or "").strip(),
                            "symbols": symbols_out,
                            "last_error": last_error,
                            "request_id": request_id,
                        }
                    )
                )
                continue

            if msg_type == "set_subscriptions":
                resolved: Set[str] = set()
                for requested in sym_set:
                    requested_clean = str(requested).strip()
                    if not requested_clean:
                        continue
                    actual, suggestions, last_error = await hub.resolve_symbol(requested_clean)
                    if not actual:
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "symbol_error",
                                    "symbol": requested_clean,
                                    "message": "Symbol not found for this broker",
                                    "suggestions": suggestions,
                                    "last_error": last_error,
                                }
                            )
                        )
                        continue
                    resolved.add(actual)
                    if actual != requested_clean:
                        await websocket.send_text(
                            json.dumps({"type": "symbol_resolved", "requested": requested_clean, "symbol": actual})
                        )

                await hub.set_subscriptions(client, resolved)
                await websocket.send_text(json.dumps({"type": "subscriptions", "symbols": sorted(client.subscriptions)}))
                continue

            if msg_type == "subscribe":
                resolved: Set[str] = set()
                for requested in sym_set:
                    requested_clean = str(requested).strip()
                    if not requested_clean:
                        continue
                    actual, suggestions, last_error = await hub.resolve_symbol(requested_clean)
                    if not actual:
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "symbol_error",
                                    "symbol": requested_clean,
                                    "message": "Symbol not found for this broker",
                                    "suggestions": suggestions,
                                    "last_error": last_error,
                                }
                            )
                        )
                        continue
                    resolved.add(actual)
                    if actual != requested_clean:
                        await websocket.send_text(
                            json.dumps({"type": "symbol_resolved", "requested": requested_clean, "symbol": actual})
                        )

                await hub.add_subscriptions(client, resolved)
                await websocket.send_text(json.dumps({"type": "subscriptions", "symbols": sorted(client.subscriptions)}))
                continue

            if msg_type == "unsubscribe":
                resolved: Set[str] = set()
                for requested in sym_set:
                    requested_clean = str(requested).strip()
                    if not requested_clean:
                        continue
                    actual, _suggestions, _last_error = await hub.resolve_symbol(requested_clean)
                    if actual:
                        resolved.add(actual)
                    resolved.add(requested_clean)

                await hub.remove_subscriptions(client, resolved)
                await websocket.send_text(json.dumps({"type": "subscriptions", "symbols": sorted(client.subscriptions)}))
                continue

            await websocket.send_text(json.dumps({"type": "error", "message": f"Unknown message type: {msg_type}"}))
    except WebSocketDisconnect:
        pass
    finally:
        await hub.unregister(client)


if __name__ == "__main__":
    import uvicorn

    port = _env_int("MT5_BRIDGE_PORT") or 8001
    uvicorn.run(app, host="127.0.0.1", port=port, reload=False)
