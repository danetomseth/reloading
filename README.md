# LRS Tracker Mobile

## Setup (exact steps)

```bash
# 1. Install dependencies
npm install

# 2. Start
npx expo start --clear
```

Then open **Expo Go** on your iPhone and scan the QR code.

## Preview on your computer (no phone deploy)

Edits show up instantly (live reload) in every option below. Run `npm install` first after pulling.

### Option 1: Web browser (fastest, nothing else to install)
```bash
npm run web
```
Opens the app at http://localhost:8081. Press `Cmd+Option+I` and use the device toolbar (iPhone size) so it looks like a phone.

Works differently on web:
- Pop-up confirms (`Alert.alert`) don't show, so sign out, delete and "apply" confirms do nothing. Test those on a simulator or phone.
- CSV / Xero import and file export use native file access and may not work.
- Appearance setting is iOS-only; web follows your Mac's light/dark mode.
- Offline cache lives in the browser's local storage, separate from the phone's. To test offline: DevTools → Network → set throttling to **Offline**, then reload a screen. Cached lists should still show; saves will fail, same as on the phone.

### Option 2: iOS Simulator (closest to the real app)
Needs Xcode from the Mac App Store (open it once to finish setup).
```bash
npm run ios
```
The first run builds the dev client into the Simulator (several minutes). After that, just run `npx expo start` and press `i`. Simulate no signal by turning off your Mac's Wi-Fi.

### Option 3: Your phone, without a new deploy
If the dev build is already installed on your phone, `npx expo start`, then open the LRS Tracker dev app on the phone (same Wi-Fi) and pick the server. JS changes reload live. You only need a new EAS build when native modules change.

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
