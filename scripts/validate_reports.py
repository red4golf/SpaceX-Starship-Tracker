#!/usr/bin/env python3
"""Validate manual report input before generating dashboard feed."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS_FILE = ROOT / "data" / "manual_reports.json"
VALID_CONFIDENCE = {"confirmed", "high", "medium", "low"}


def parse_iso8601(value: str) -> bool:
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def validate_report(report: dict) -> list[str]:
    errors: list[str] = []

    require(bool(report.get("mission")), "mission is required", errors)

    launch = report.get("launch", {})
    require(bool(launch.get("site")), "launch.site is required", errors)
    require(bool(launch.get("source")), "launch.source is required", errors)
    if launch.get("official_time_utc"):
        require(
            parse_iso8601(launch["official_time_utc"]),
            "launch.official_time_utc must be ISO8601",
            errors,
        )

    vehicles = report.get("vehicles")
    require(isinstance(vehicles, list) and len(vehicles) > 0, "vehicles must be a non-empty array", errors)
    for idx, vehicle in enumerate(vehicles or []):
        prefix = f"vehicles[{idx}]"
        require(bool(vehicle.get("booster")), f"{prefix}.booster is required", errors)
        require(bool(vehicle.get("ship")), f"{prefix}.ship is required", errors)
        require(bool(vehicle.get("status")), f"{prefix}.status is required", errors)
        milestone = vehicle.get("next_milestone", {})
        require(bool(milestone.get("name")), f"{prefix}.next_milestone.name is required", errors)
        confidence = milestone.get("confidence")
        require(confidence in VALID_CONFIDENCE, f"{prefix}.next_milestone.confidence must be one of {sorted(VALID_CONFIDENCE)}", errors)
        require(bool(milestone.get("source")), f"{prefix}.next_milestone.source is required", errors)
        for field in ("source_published_at", "collected_at"):
            if milestone.get(field):
                require(parse_iso8601(milestone[field]), f"{prefix}.next_milestone.{field} must be ISO8601", errors)

    timeline = report.get("timeline")
    require(isinstance(timeline, list), "timeline must be an array", errors)
    seen_event_ids: set[str] = set()
    for idx, event in enumerate(timeline or []):
        prefix = f"timeline[{idx}]"
        event_id = event.get("event_id")
        require(bool(event_id), f"{prefix}.event_id is required", errors)
        if event_id:
            require(event_id not in seen_event_ids, f"{prefix}.event_id must be unique", errors)
            seen_event_ids.add(event_id)
        require(bool(event.get("time")), f"{prefix}.time is required", errors)
        if event.get("time"):
            require(parse_iso8601(event["time"]), f"{prefix}.time must be ISO8601", errors)
        require(bool(event.get("milestone")), f"{prefix}.milestone is required", errors)
        require(event.get("confidence") in VALID_CONFIDENCE, f"{prefix}.confidence must be one of {sorted(VALID_CONFIDENCE)}", errors)
        require(bool(event.get("source")), f"{prefix}.source is required", errors)
        for field in ("source_published_at", "collected_at"):
            if event.get(field):
                require(parse_iso8601(event[field]), f"{prefix}.{field} must be ISO8601", errors)

    telemetry = report.get("launch_telemetry")
    if telemetry is not None:
        require(isinstance(telemetry, dict), "launch_telemetry must be an object", errors)
        track = telemetry.get("track", []) if isinstance(telemetry, dict) else []
        require(isinstance(track, list), "launch_telemetry.track must be an array", errors)
        for idx, point in enumerate(track or []):
            prefix = f"launch_telemetry.track[{idx}]"
            require(isinstance(point.get("lat"), (int, float)), f"{prefix}.lat must be numeric", errors)
            require(isinstance(point.get("lon"), (int, float)), f"{prefix}.lon must be numeric", errors)

    map_context = report.get("map_context")
    require(isinstance(map_context, list), "map_context must be an array", errors)

    return errors


def main() -> None:
    report = json.loads(REPORTS_FILE.read_text(encoding="utf-8"))
    errors = validate_report(report)
    if errors:
        print("Validation failed:")
        for err in errors:
            print(f" - {err}")
        raise SystemExit(1)
    print("Validation passed.")


if __name__ == "__main__":
    main()
