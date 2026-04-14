# Operations Runbook

## Daily operator flow

1. Edit `data/manual_reports.json` with sourced updates.
2. Run validation:
   - `python scripts/validate_reports.py`
3. Regenerate feed:
   - `python scripts/update_dashboard.py`
4. Commit and push changes.

## Cadence modes

- `normal`: no official launch time.
- `pre_launch`: launch time exists and is >24h away.
- `launch_day`: launch time exists and is within 24h.
- `post_launch`: launch time has passed.

Mode is generated into `data/dashboard.json` and emitted in workflow output.

## GitHub Actions

### Standard schedule
- Workflow: `Update Starship Dashboard Data`
- Runs around 08:00 and 20:00 PT with DST-safe gating.

### High frequency post-launch mode
- Workflow: `Post-launch High Frequency Poller`
- Runs every 5 minutes, but only commits when mode is `post_launch`.
- Requires repository variable `ENABLE_HIGH_FREQUENCY=true`.

## Incident playbook

- **Validation fails:** fix `data/manual_reports.json` fields/timestamps/confidence values.
- **No dashboard updates:** check Actions logs for skipped gate or unchanged feed.
- **No Telegram alerts:** verify `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` secrets.
- **Stale data warning in UI:** refresh feed generation and confirm commit/push.
