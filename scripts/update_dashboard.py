#!/usr/bin/env python3
"""Generate dashboard.json from manually curated reports.

Intended usage:
- GitHub Actions scheduled twice daily (08:00 and 20:00 America/Los_Angeles)
- Optional local runner for higher-frequency post-launch updates.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from validate_reports import validate_report

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
REPORTS_FILE = DATA_DIR / "manual_reports.json"
DASHBOARD_FILE = DATA_DIR / "dashboard.json"


def now_utc() -> datetime:
    fixed = os.getenv("DASHBOARD_NOW_UTC")
    if fixed:
        return parse_iso8601(fixed)
    return datetime.now(tz=UTC)


def parse_iso8601(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def format_countdown(official_time_utc: str | None) -> str | None:
    if not official_time_utc:
        return None

    launch_time = parse_iso8601(official_time_utc)
    delta = launch_time - now_utc()
    total_seconds = int(delta.total_seconds())

    if total_seconds <= 0:
        return "LIVE / POST-LAUNCH"

    days, rem = divmod(total_seconds, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, seconds = divmod(rem, 60)
    return f"T-{days}d {hours:02}h {minutes:02}m {seconds:02}s"


def determine_mode(report: dict) -> str:
    launch_time_str = report["launch"].get("official_time_utc")
    if not launch_time_str:
        return "normal"

    launch_time = parse_iso8601(launch_time_str)
    delta_seconds = int((launch_time - now_utc()).total_seconds())

    if delta_seconds <= 0:
        return "post_launch"
    if delta_seconds <= 24 * 3600:
        return "launch_day"
    return "pre_launch"


def build_dashboard(report: dict) -> dict:
    generated_at = now_utc().isoformat()
    launch_countdown = format_countdown(report["launch"].get("official_time_utc"))
    livestream_countdown = format_countdown(report["launch"].get("livestream_start_utc"))
    mode = determine_mode(report)

    vehicles = []
    for item in report["vehicles"]:
        vehicles.append(
            {
                "booster": item["booster"],
                "ship": item["ship"],
                "status": item["status"],
                "next_milestone": item["next_milestone"],
                "countdown": launch_countdown,
            }
        )

    timeline = []
    for event in report["timeline"]:
        timeline.append(
            {
                "event_id": event["event_id"],
                "mission": report["mission"],
                "time": event["time"],
                "milestone": event["milestone"],
                "confidence": event["confidence"],
                "source": event["source"],
                "source_published_at": event.get("source_published_at"),
                "collected_at": event.get("collected_at"),
                "collector": event.get("collector"),
                "notes": event.get("notes"),
                "vehicle_ref": event.get("vehicle_ref"),
            }
        )

    timeline.sort(key=lambda e: parse_iso8601(e["time"]))

    return {
        "generated_at": generated_at,
        "timezone": "America/Los_Angeles",
        "mode": mode,
        "cadence": {
            "normal": "2x daily",
            "launch_day": "2x daily + optional manual checks",
            "post_launch": "high-frequency (recommended 15s polling via local runner)",
        },
        "mission": report["mission"],
        "launch": {
            **report["launch"],
            "countdown": launch_countdown,
            "livestream_countdown": livestream_countdown,
        },
        "vehicles": vehicles,
        "timeline": timeline,
        "map_context": report["map_context"],
        "launch_telemetry": report.get("launch_telemetry", {"track": [], "events": []}),
        "health": {
            "generated_at": generated_at,
            "source_count": len({e["source"] for e in timeline}) if timeline else 0,
            "event_count": len(timeline),
            "stale_after_hours": 12,
        },
    }


def write_dashboard(dashboard: dict) -> None:
    with DASHBOARD_FILE.open("w", encoding="utf-8") as fh:
        json.dump(dashboard, fh, indent=2)
        fh.write("\n")


def main() -> None:
    report = json.loads(REPORTS_FILE.read_text(encoding="utf-8"))
    errors = validate_report(report)
    if errors:
        print("Validation failed:")
        for err in errors:
            print(f" - {err}")
        raise SystemExit(1)

    dashboard = build_dashboard(report)
    write_dashboard(dashboard)

    mode = dashboard["mode"]
    if os.getenv("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as fh:
            fh.write(f"mode={mode}\n")

    print(f"Updated: {DASHBOARD_FILE} (mode={mode})")


if __name__ == "__main__":
    main()
