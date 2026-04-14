#!/usr/bin/env python3
"""Send Telegram notifications when timeline changes.

Required env vars:
- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from urllib import parse, request

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
DASHBOARD = DATA_DIR / "dashboard.json"
LAST_SENT = DATA_DIR / ".last_notified_timeline.json"


def load_json(path: Path, default):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def send_message(token: str, chat_id: str, text: str) -> None:
    payload = parse.urlencode({"chat_id": chat_id, "text": text}).encode("utf-8")
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    req = request.Request(url, data=payload, method="POST")
    with request.urlopen(req, timeout=10) as _:
        return


def event_key(event: dict) -> tuple:
    return (
        event.get("event_id"),
        event.get("mission"),
        event.get("vehicle_ref"),
        event.get("time"),
        event.get("milestone"),
    )


def main() -> None:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        print("Telegram not configured; skipping.")
        return

    dashboard = load_json(DASHBOARD, {})
    timeline = dashboard.get("timeline", [])
    previous = load_json(LAST_SENT, [])

    prev_keys = {event_key(e) for e in previous}
    new_events = [e for e in timeline if event_key(e) not in prev_keys]

    for event in new_events:
        text = (
            f"🚀 {event.get('mission')}\n"
            f"Event ID: {event.get('event_id')}\n"
            f"Vehicle: {event.get('vehicle_ref', 'n/a')}\n"
            f"Milestone: {event.get('milestone')}\n"
            f"Confidence: {event.get('confidence')}\n"
            f"Time (UTC): {event.get('time')}\n"
            f"Source: {event.get('source')}"
        )
        send_message(token, chat_id, text)

    with LAST_SENT.open("w", encoding="utf-8") as fh:
        json.dump(timeline, fh, indent=2)
        fh.write("\n")

    print(f"Sent {len(new_events)} Telegram notifications.")


if __name__ == "__main__":
    main()
