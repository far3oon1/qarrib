# Qarrib Mobile Releases — Play Store (Android) + App Store (iOS)

All mobile builds run **online against Vercel** (`https://qarrib1.vercel.app/api`).
`frontend/js/api.js` auto-detects Capacitor native (`capacitor://`) and uses the
live API, so no extra config is needed in the app.

## Versioning

- Root `package.json` version: **1.1.0**
- `android/app/build.gradle`: `versionCode 2`, `versionName "1.1.0"`
- Bump `versionCode` (+1) on **every** Play Store upload. Keep
  `applicationId com.qarrab.healthcare` forever.

## Android — Google Play (.aab)

```bash
npm install
npm run android:bundle   # builds frontend bridge + cap sync + bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab` — upload
this file to Play Console (Testing → Production). The `.aab` (not `.apk`) is
what Google Play requires.

First-time signing setup (one time per machine):

1. Generate a keystore: `keytool -genkey -v -keystore qarrib-release.keystore -alias qarrib -keyalg RSA -keysize 2048 -validity 10000`
2. Create `android/keystore.properties` (git-ignored):
   `storeFile=../qarrib-release.keystore`, `storePassword=...`, `keyAlias=qarrib`, `keyPassword=...`
3. Back up the keystore + passwords — losing it means a new app listing.

Debug install on a phone: `npm run android:apk`, then install
`android/app/build/outputs/apk/debug/app-debug.apk`.

## iOS — App Store (.ipa, needs a Mac)

`ios/` is not committed (generated on macOS). On a Mac:

```bash
npm install
npm run ios:add     # first time only: creates ios/ folder
npm run ios:sync    # every release: rebuild bridge + copy frontend
npm run ios:open    # opens Xcode
```

In Xcode: select team + bundle id `com.qarrab.healthcare`, Product → Archive,
then Distribute App → App Store Connect. Required `Info.plist` usage strings
(privacy labels for the store):

- `NSLocationWhenInUseUsageDescription` — live nurse/patient tracking
- `NSCameraUsageDescription` — service + ID document photos
- `NSPhotoLibraryUsageDescription` / `NSPhotoLibraryAddUsageDescription` — uploads
- `NSContactsUsageDescription` — only if contact access is enabled

## Every update (both stores)

1. Bump root `package.json` version + Android `versionCode`.
2. Test AR/EN toggle on register + login tabs (exact-match i18n, backend
   `message`/`message_en` follows the toggle).
3. `npm run android:bundle` → upload `.aab` to Play Console.
4. On Mac: `npm run ios:sync` → Archive → upload build to App Store Connect.
5. Desktop (Win/Linux/Mac): `npm run build:win` / `build:linux` / `build:mac`
   (or `build:all` on the matching OS). Desktop runs online-first against
   Vercel and falls back to the bundled backend offline.
