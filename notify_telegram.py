#!/usr/bin/env python3
"""Convenience wrapper to run Telegram notifier from any working directory."""

from pathlib import Path
import runpy

REPO_ROOT = Path(__file__).resolve().parent
TARGET = REPO_ROOT / "scripts" / "notify_telegram.py"

if not TARGET.exists():
    raise SystemExit(f"Notifier script not found: {TARGET}")

runpy.run_path(str(TARGET), run_name="__main__")
