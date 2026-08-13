from __future__ import annotations

import importlib
import os
import sys
from types import ModuleType


def test_main_import_does_not_require_yaml_when_morebets_disabled(monkeypatch) -> None:
    monkeypatch.setenv("MSP_AGGREGATOR_ENABLED", "0")
    monkeypatch.delenv("MSP_MOREBETS_POLICY_ENABLED", raising=False)
    monkeypatch.delenv("MSP_MOREBETS_DISPATCHER_ENABLED", raising=False)

    sys.modules.pop("aggregator.main", None)
    sys.modules.pop("aggregator.morebets_dispatcher", None)
    sys.modules.pop("aggregator.morebets_policy", None)

    original_import = __import__

    def guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name in {"yaml", "aggregator.morebets_policy", "aggregator.morebets_dispatcher"}:
            raise AssertionError(f"unexpected import when MoreBets disabled: {name}")
        return original_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr("builtins.__import__", guarded_import)

    mod = importlib.import_module("aggregator.main")
    assert isinstance(mod, ModuleType)
