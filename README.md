# SpaceX Starship Tracker

Public read-only dashboard for **Starship full-stack progress** (Super Heavy + Ship) with standardized milestones, confidence levels, launch countdowns, and near-real-time launch event polling support.

## What this includes

- Fleet overview cards for stack pairs.
- Mission timeline with confidence labels.
- Launch map context block with source links.
- PT/Seattle-oriented display behavior.
- Scheduled update workflow (2x daily cadence).
- Telegram notifier for newly detected milestone events.

## Data model

Primary source file:
- `data/manual_reports.json` — curated source-backed mission updates.

Generated file:
- `data/dashboard.json` — rendered dashboard feed for the web UI.

Standardized milestones list:
- `data/standardized_milestones.json`

## Local run

```bash
python3 scripts/update_dashboard.py
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Automation

Workflow: `.github/workflows/update-dashboard.yml`

- Runs on schedule twice daily (UTC approximation of 08:00 and 20:00 PT).
- Regenerates `data/dashboard.json`.
- Commits/pushes only when the feed changes.
- Sends Telegram notifications if secrets are configured:
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_CHAT_ID`

## Operating model

- **Normal cadence:** poll/update feed twice daily.
- **Pre-launch:** same twice daily cadence with countdown if official launch time exists.
- **Post-launch:** run a local/hosted poller at higher frequency (e.g., 15 seconds) and push updates to GitHub for near-real-time timeline progression.
