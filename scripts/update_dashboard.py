#!/usr/bin/env python3
"""Generate dashboard.json from manually curated reports.

Intended usage:
- GitHub Actions scheduled twice daily (08:00 and 20:00 America/Los_Angeles)
- Optional local runner for higher-frequency post-launch updates.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
REPORTS_FILE = DATA_DIR / "manual_reports.json"
DASHBOARD_FILE = DATA_DIR / "dashboard.json"


@dataclass
class LaunchContext:
    official_time_utc: str | None


def load_reports() -> dict:
    with REPORTS_FILE.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def format_countdown(official_time_utc: str | None) -> str | None:
    if not official_time_utc:
        return None

    launch_time = datetime.fromisoformat(official_time_utc.replace("Z", "+00:00")).astimezone(UTC)
    now = datetime.now(tz=UTC)
    delta = launch_time - now
    total_seconds = int(delta.total_seconds())

    if total_seconds <= 0:
        return "LIVE / POST-LAUNCH"

    days, rem = divmod(total_seconds, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, seconds = divmod(rem, 60)
    return f"T-{days}d {hours:02}h {minutes:02}m {seconds:02}s"


def build_dashboard(report: dict) -> dict:
    countdown = format_countdown(report["launch"].get("official_time_utc"))

    vehicles = []
    for item in report["vehicles"]:
        vehicles.append(
            {
                "booster": item["booster"],
                "ship": item["ship"],
                "status": item["status"],
                "next_milestone": item["next_milestone"],
                "countdown": countdown,
            }
        )

    timeline = []
    for event in report["timeline"]:
        timeline.append(
            {
                "mission": report["mission"],
                "time": event["time"],
                "milestone": event["milestone"],
                "confidence": event["confidence"],
                "source": event["source"],
            }
        )

    return {
        "generated_at": datetime.now(tz=UTC).isoformat(),
        "timezone": "America/Los_Angeles",
        "mission": report["mission"],
        "launch": report["launch"],
        "vehicles": vehicles,
        "timeline": timeline,
        "map_context": report["map_context"],
    }


def write_dashboard(dashboard: dict) -> None:
    with DASHBOARD_FILE.open("w", encoding="utf-8") as fh:
        json.dump(dashboard, fh, indent=2)
        fh.write("\n")


def main() -> None:
    report = load_reports()
    dashboard = build_dashboard(report)
    write_dashboard(dashboard)
    print(f"Updated: {DASHBOARD_FILE}")


if __name__ == "__main__":
    main()
