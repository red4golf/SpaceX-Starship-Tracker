# SpaceX Starship Tracker

Public read-only dashboard for **Starship full-stack progress** (Super Heavy + Ship) with standardized milestones, confidence levels, source provenance, launch countdowns, and launch-mode-aware operating cadence.

## What this includes

- Fleet overview cards for stack pairs.
- Mission timeline grouped by day with filter controls (confidence + vehicle).
- Launch map context with optional coordinates.
- Data health panel with freshness indicator and mode/cadence summary.
- Scheduled update workflow (2x daily at 08:00/20:00 PT with DST-safe gating).
- Optional high-frequency post-launch workflow.
- Telegram notifier for newly detected timeline events.

## Data model

Primary source file:
- `data/manual_reports.json` — curated source-backed mission updates.

Generated file:
- `data/dashboard.json` — rendered dashboard feed for the web UI.

Standardized milestones list:
- `data/standardized_milestones.json`

Schema reference:
- `schemas/manual_reports.schema.json`

## Local run

From the repository root (preferred):

```bash
python3 scripts/validate_reports.py
python3 scripts/update_dashboard.py
python3 -m http.server 8080
```

If the root wrapper exists, this also works:

```bash
python3 update_dashboard.py
```

PowerShell (from any directory, using absolute path):

```powershell
python "C:\path\to\SpaceX-Starship-Tracker\scripts\validate_reports.py"
python "C:\path\to\SpaceX-Starship-Tracker\scripts\update_dashboard.py"
python -m http.server 8080
```

One-command PowerShell launcher (runs update then serves on port 8080):

```powershell
.\start_dashboard.ps1
```

Then open `http://localhost:8080`.

### Troubleshooting (Windows)

If you see `can't open file ... update_dashboard.py`:

1. Confirm you are inside the cloned folder:
   ```powershell
   pwd
   dir
   ```
2. Run the script from `scripts/` explicitly:
   ```powershell
   python .\scripts\update_dashboard.py
   ```
3. If needed, run with absolute path:
   ```powershell
   python "C:\dev\SpaceX-Starship-Tracker\scripts\update_dashboard.py"
   ```

## Automation

Workflow: `.github/workflows/update-dashboard.yml`

- Runs on schedule with DST/PST-safe gating so updates occur at 08:00 and 20:00 PT.
- Validates report schema/content before generation.
- Regenerates `data/dashboard.json`.
- Commits/pushes only when the feed changes.
- Sends Telegram notifications if secrets are configured:
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_CHAT_ID`

Workflow: `.github/workflows/post-launch-poller.yml`

- Optional high-frequency run every 5 minutes.
- Only active when repository variable `ENABLE_HIGH_FREQUENCY=true`.
- Only publishes in `post_launch` mode.

## Operating model

- **normal:** no official launch time.
- **pre_launch:** launch time exists and is more than 24 hours away.
- **launch_day:** launch time exists and is within 24 hours.
- **post_launch:** launch time has passed; high-frequency polling recommended.

## CI checks

Workflow: `.github/workflows/ci.yml`

- Python syntax checks for scripts/wrappers.
- Report validation checks.
- Deterministic generator check (fixed clock via `DASHBOARD_NOW_UTC`).
