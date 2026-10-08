# Praxio mobile

A companion to the Praxio website, not a copy of it: **Today** (your next move, position, progress),
**Tasks** (mark a module complete, submit a GitHub repo, see project results), **Career** (top
matches) and **Profile**. The assessment, feasibility, market, family and advisor stay on the web.

Built with Expo (SDK 57). It reuses Praxio's shared logic from `../app/src/lib` (Decision Engine,
progress, project evaluation); `metro.config.js` swaps in `src/supabaseClient.js` for the
website's Supabase client. It talks to the same Supabase project, so everything stays in sync.

## Run it on your phone (Expo Go)

1. Copy `.env.example` to `.env.local` and fill in the same Supabase URL and anon key as `app/.env`.
2. Install **Expo Go** from the Play Store / App Store.
3. From this folder:
   ```bash
   npx expo start
   ```
   Scan the QR code (Android: inside Expo Go; iPhone: Camera app). If the phone can't reach your PC
   (different Wi-Fi, VPN), use `npx expo start --tunnel`.

On Windows PowerShell, use `npx.cmd` if `npx` is blocked by the execution policy.

## Signing in: connect your phone

On the website: account menu → **Connect your phone** shows a QR code and an 8-character code
(5 minutes, single use). In the app: **Scan QR code** or type the code. The `device-link` edge
function turns it into a one-time token the phone exchanges for its own session; no password is
entered on the phone. Email + password remains as a fallback.

Needs the `device_link_codes` table (`app/supabase/migrations/20261013000000_device_link_codes.sql`)
and the `device-link` function (`npx supabase functions deploy device-link --use-api`).

## Offline

The last successful load is cached on the device and shown instantly on launch (with "Updated …
ago"), then refreshed. Signing out clears it.

## Build an installable app (EAS)

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR-PROJECT.supabase.co --visibility plaintext
npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value YOUR-ANON-KEY --visibility plaintext
npx eas-cli@latest build --platform android --profile preview
```

The preview profile produces an APK you can install directly (or share the link EAS gives you).
Repeat the `env:create` commands with `--environment production` before a `production` build.
The website's QR is an ordinary https link (`/link?code=…`), so any phone camera opens it; that page
offers "Open the Praxio app" (a `praxio://link?code=…` link, which installed builds handle and pair
from directly) and shows the code to type.

## Developing

`npm test` runs the view-model tests (`tests/model.test.mjs`): `src/model.js` holds every screen's
data logic with no React Native imports, tested against empty, malformed, old-cache and realistic data.

`http://localhost:8081/?preview` on the web dev server (`npx expo start --web`) renders the signed-in
screens with sample data built by Praxio's own logic (development only; never in a phone build).
