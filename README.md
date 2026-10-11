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

## Manual load data
Published load tables live in `lib/manualData.ts` (currently Hornady 12th Edition, 300 Norma Mag: 220 ELD-X and 250 A-Tip Match).
When a load's caliber or rifle name matches a cartridge there and the bullet weight matches, the load form shows the published
start-to-max charges for the chosen powder, can plan a ladder from start toward max, and can fill primer, brass, trim length and Hornady COAL.
Charges above the published max are flagged. To add more, send screenshots of the manual pages and copy a table block in that file.
