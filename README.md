# LRS Tracker Mobile

## Setup (exact steps)

```bash
# 1. Install dependencies
npm install

# 2. Start
npx expo start --clear
```

Then open **Expo Go** on your iPhone and scan the QR code.

## Notes
- No native modules — works in Expo Go out of the box
- BLE (Kestrel) requires Xcode build — add later
- Data syncs via Supabase

## Load IDs and ballistics (October 2026 update)
1. In Supabase → SQL Editor, run `supabase-migration-ids-ballistics.sql` once (adds columns, backs up current IDs, links loads to rifles).
2. Open **Reloads** → tap **Switch to per-rifle load IDs** → check the preview → **Apply**. Old IDs and lot numbers stay on each load.
3. Name Garmin Xero sessions with the load ID (e.g. `25CM-007`) and imports land on that load.

No new native modules: works with the existing dev build and Expo Go.

Ballistics engine: `lib/ballistics/` (point-mass RK4, G1/G7, truing). After changing it, run
`npx tsx scripts/validate-ballistics.ts` — it checks against reference trajectories and truing round trips.
