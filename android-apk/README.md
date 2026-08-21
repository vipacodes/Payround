# Payround Android APK (Trusted Web Activity)

The `payround.apk` in `/public` is a real Android app that opens
https://payround-omega.vercel.app full-screen (no browser bar). It was
built with Google's Bubblewrap from `twa-manifest.json`.

## ⚠️ KEEP `android.keystore` SAFE
- Passwords (store + key): `payround2026`  · alias: `payround`
- Every future APK update MUST be signed with THIS keystore or Android
  will refuse to update the app (users would have to uninstall first).
- SHA256 fingerprint (must match /.well-known/assetlinks.json):
  5C:30:A1:46:7D:83:C3:23:94:BA:EC:63:CE:A9:6A:DD:7F:66:70:6D:B7:B7:8C:A6:17:A4:1F:C8:9F:9D:1B:FE

## Why there is no browser bar
`public/.well-known/assetlinks.json` on the site declares the app's
signing fingerprint. Android checks it on first launch — when it matches,
the app runs full-screen like a native app. If you ever re-generate the
keystore, update that file too.

## Rebuilding after changes (only needed for icon/name/color changes —
## normal site updates appear in the app automatically!)
```bash
npm i @bubblewrap/cli
npx bubblewrap update            # regenerates the Android project
npx bubblewrap build             # asks for the keystore passwords
# output: app-release-signed.apk
```

## Notes
- The app is a live view of the website: deploys to Vercel update the
  app instantly. Only rebuild the APK to change its icon, name, colors
  or version.
- Version: 1.0.0 (versionCode 1) — bump `appVersionCode` in
  twa-manifest.json for each new APK release.
- Not on Google Play. To publish there later, the same project works —
  Play needs an .aab (`npx bubblewrap build` also produces one).
