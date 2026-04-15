#!/usr/bin/env python3
"""Convenience wrapper to run the dashboard generator from any working directory.

Usage:
  python update_dashboard.py
  python /full/path/to/repo/update_dashboard.py
"""

from pathlib import Path
import runpy

REPO_ROOT = Path(__file__).resolve().parent
TARGET = REPO_ROOT / "scripts" / "update_dashboard.py"

if not TARGET.exists():
    raise SystemExit(f"Generator script not found: {TARGET}")

runpy.run_path(str(TARGET), run_name="__main__")
