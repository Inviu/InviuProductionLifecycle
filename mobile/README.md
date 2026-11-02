# INVUI Mobile App

The native (Expo / React Native) app operators use on the shop floor to log
shift production entries.

## It shares the web app's backend

As of the integration, the mobile app talks to the **same backend and database
as the web dashboard** (`backend/` in this repo, deployed at
`https://flowforge-backend-mip6.onrender.com`). Anything an operator logs on the
phone is immediately visible on the web dashboard's **Production Log** page, and
products / processes / machines are shared master data — there is now a single
source of truth.

The old standalone mobile API (`mobile/api`, formerly `amemelya/Invuie_API`) has
been **retired**. Its endpoints were folded into the web backend
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

Login → pick a product → pick a process → pick a machine (skipped if the process
has none) → enter the shift (worker, start/end time, units, any issue reasons) →
submit. The entry is saved to the shared database.
