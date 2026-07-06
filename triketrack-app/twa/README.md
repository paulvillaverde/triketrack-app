# TrikeTrack TWA

This folder contains a separate Android Trusted Web Activity wrapper for the hosted PWA build. It does not replace the existing Expo native Android project.

## Build

Deploy the Expo web export to Vercel, then run the TWA build against that Vercel domain:

```powershell
$env:TWA_HOST = "https://project-x1g12.vercel.app"
npm run build:twa
```

The build script also understands Vercel's `VERCEL_PROJECT_PRODUCTION_URL` and `VERCEL_URL` environment variables. `TWA_HOST` is still the clearest local override.

For a release build:

```powershell
$env:TWA_HOST = "https://project-x1g12.vercel.app"
npm run build:twa -- -Task assembleRelease
```

## Domain Verification

After signing the release app, publish an asset links file at:

```text
https://project-x1g12.vercel.app/.well-known/assetlinks.json
```

`public/.well-known/assetlinks.json` currently contains the local debug signing fingerprint so the debug APK can be tested. Replace it with your release or Play App Signing SHA-256 fingerprint before publishing the Play Store build.
