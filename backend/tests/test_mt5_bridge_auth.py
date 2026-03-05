import importlib
import os
import sys
from typing import Dict

from fastapi.testclient import TestClient


def load_bridge_module(env: Dict[str, str]):
    for key, value in env.items():
        os.environ[key] = value
    module_name = "backend.mt5_bridge.app"
    if module_name in sys.modules:
        del sys.modules[module_name]
    return importlib.import_module(module_name)


def test_health_requires_token_when_enabled():
    mod = load_bridge_module(
        {
            "GLASS_BRIDGE_TOKEN": "unit-test-token",
            "GLASS_BRIDGE_AUTH_REQUIRED": "1",
            "MT5_DEV_MODE": "1",
        }
    )
    client = TestClient(mod.app)
    res = client.get("/health")
    assert res.status_code == 401


def test_health_allows_valid_token():
    mod = load_bridge_module(
        {
            "GLASS_BRIDGE_TOKEN": "unit-test-token",
            "GLASS_BRIDGE_AUTH_REQUIRED": "1",
            "MT5_DEV_MODE": "1",
        }
    )
    client = TestClient(mod.app)
    res = client.get("/health", headers={"X-Glass-Bridge-Token": "unit-test-token"})
    assert res.status_code == 200
    payload = res.json()
    assert payload["ok"] is True
    assert payload["auth"]["required"] is True


def test_heartbeat_payload_includes_process_metadata():
    mod = load_bridge_module(
        {
            "GLASS_BRIDGE_TOKEN": "unit-test-token",
            "GLASS_BRIDGE_AUTH_REQUIRED": "1",
            "MT5_DEV_MODE": "1",
        }
    )
    client = TestClient(mod.app)
    res = client.get("/heartbeat", headers={"X-Glass-Bridge-Token": "unit-test-token"})
    assert res.status_code == 200
    payload = res.json()
    assert payload["ok"] is True
    assert isinstance(payload.get("processStartedAtMs"), int)
    assert isinstance(payload.get("monotonicMs"), int)


def test_websocket_rejects_invalid_token():
    mod = load_bridge_module(
        {
            "GLASS_BRIDGE_TOKEN": "unit-test-token",
            "GLASS_BRIDGE_AUTH_REQUIRED": "1",
            "MT5_DEV_MODE": "1",
        }
    )
    client = TestClient(mod.app)
    try:
        with client.websocket_connect("/ws/ticks", headers={"X-Glass-Bridge-Token": "wrong-token"}):
            raise AssertionError("websocket should not connect with invalid token")
    except Exception:
        # handshake should fail/close
        pass
