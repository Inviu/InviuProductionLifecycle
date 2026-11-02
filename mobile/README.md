# INVIU Mobile App

The native (Expo / React Native) app operators use on the shop floor to log
shift production entries.

## It shares the web app's backend

As of the integration, the mobile app talks to the **same backend and database
as the web dashboard** (`backend/` in this repo, deployed at
`https://flowforge-backend-mip6.onrender.com`). Anything an operator logs on the
phone is immediately visible on the web dashboard's **Production Log** page, and
products / processes / machines are shared master data — there is now a single
source of truth.

The old standalone mobile API (`mobile/api`) has been **retired**. Its
endpoints were folded into the web backend
(`/api/production-entries`, plus the existing `/api/products`,
`/api/products/:id/processes`, `/api/machines?processId=`). The old code remains
in this repo's git history if ever needed.

## Running the app

```bash
cd mobile/app
npm install
npx expo start
```

Then open it in Expo Go on a phone, or press `a` / `i` for an Android/iOS
emulator, or `w` for web.

### Login

Real accounts from the web backend (JWT auth):

- `operator` / `operator123`
- `manager` / `manager123`

### Pointing at a different backend

The API base URL is read from `app/app.json` → `expo.extra.apiUrl`. Change it
there (e.g. to `http://localhost:5001` when running the backend locally) and
restart Expo.

## Flow

After login the app opens on a **Home hub** with two modes:

1. **Work Orders** — the operator queue of actionable steps (manager-created
   orders that are unlocked and still have units left). For each, the operator
   enters a quantity and taps **Done**; the backend decrements inventory,
   advances the order, and unlocks the next step. Work-order steps need a live
   connection (they touch shared inventory/locking), so this mode is online-only.
2. **Log Production** — pick a product → process → machine (skipped if the
   process has none) → enter the shift (worker, start/end time, units, any issue
   reasons) → submit. Saved to the shared database, and **offline-capable**
   (see below).

## Offline behaviour (shop-floor fail-safe)

The app is built to survive a flaky Wi-Fi connection on the floor:

- **Writes are never lost.** If a production entry is submitted while offline,
  it's saved on the device and the operator sees "Saved offline". A background
  queue retries automatically the moment the connection returns (it also retries
  on app open). This uses `@react-native-community/netinfo` to detect
  connectivity.
- **Reads keep working.** The product / process / machine lists are cached, so
  an operator can keep navigating during a short dropout from the last-good data.
- **Status is visible.** A banner shows "Offline" and how many entries are
  waiting to sync; tapping it forces a retry.

Relevant files: `services/offlineQueue.js`, `services/storage.js`,
`services/api.js` (read-through cache), `hooks/useOfflineSync.js`,
`components/OfflineBanner.jsx`.

## Over-the-air updates (EAS Update)

OTA is pre-wired: `expo-updates` is installed, `runtimeVersion` is set
(`app.json`), and the build profiles carry update channels (`preview`,
`production`) in `eas.json`. The only step left needs your Expo account — after
`eas init`, run once:

```bash
eas update:configure
```

That links the app to your project (adds the update URL). From then on, publish
a JS fix to everyone without rebuilding:

```bash
eas update --channel preview --message "what changed"
```

Installed apps pick it up on next launch. You only need a fresh **build** when
you add a new **native** capability (e.g. a camera/barcode library) — plain
JS/UI changes ship over the air.

## Building a real installable app (EAS Build)

Expo Go + `npx expo start` is only for development. To put the app on a real
phone/tablet that operators just tap open (no computer, no dev server), build a
standalone binary with EAS Build. The project is already configured
(`eas.json`, Android package `com.inviu.inviu`, iOS bundle id `com.inviu.inviu`).

One-time, on your machine:

```bash
cd mobile/app
npm install -g eas-cli        # or use: npx eas-cli@latest <cmd>
eas login                     # log into (or create) your free Expo account
eas init                      # links this app to an Expo project (creates the projectId)
```

Then, to build a shareable **Android APK**:

```bash
eas build -p android --profile preview
```

It builds in Expo's cloud (~10–15 min) and gives you a download link for an
`.apk`. Send that link/file to any Android phone **or tablet**, open it, allow
"install from unknown sources", and it installs like any app — it talks to the
live backend over the internet, so no laptop is involved.

Rebuild and resend the APK whenever you ship app changes.

### iPhone / iPad

iOS can't run the Android APK. To put it on an iPad/iPhone you need an **Apple
Developer account ($99/yr)**, then:

```bash
eas build -p ios --profile preview
```

and distribute via TestFlight. The app is already marked iPad-capable
(`ios.supportsTablet`). For a wide rollout, publish to the Play Store / App Store.

> Note: the app is currently locked to **portrait**. It runs on tablets as-is
> (portrait); allowing landscape on larger screens is a small `app.json` change
> if you want it later.
