"""Importing an entrypoint must not build a Pyrogram Client or touch the
network: clients are created inside the running loop (see test_pyrogram_adapter)."""

import importlib


def test_entrypoints_import_without_side_effects():
    for name in ("main_core", "main_payment"):
        module = importlib.import_module(f"userbot_service.{name}")
        assert callable(module.main)
        assert not hasattr(module, "app")
