# Cat Grid 1.0.0 release

Bundle/package ID: `com.mohamadlounnas.catgrid`. Apple team: `97L93HH6B4` (mohamed lounnas). Google Play: Physia.dev, account `5765540137409765817`. First iOS release targets iPhone; Android supports phones and compatible tablets. No Firebase setup is needed.

## Build and verification

- `npm ci && npm test && npm run native:sync`
- `npm run ios` / `npm run android` to open native projects.
- Android requires Java 21 and Android SDK 36. Set `JAVA_HOME` to Java 21, then run `python3 scripts/build-android-release.py`.
- Android upload credentials are at `~/.config/catgrid/signing/android.json`, outside the repository, with restricted permissions. Back up that directory securely. Never put signing files or passwords in source, logs or store screenshots.
- Archive the `App` scheme in `ios/App/App.xcodeproj`, then export with `release/ExportOptions.plist`. Apple's signing account and certificate must remain available on the build machine.
- Use an absolute export path and a system-first PATH (`/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin`) if Homebrew rsync causes Xcode's `--extended-attributes` copy failure.
- Before upload, confirm the archived `public/index.html` matches `dist/index.html`, the privacy manifest is included, the bundle is signed, and the version/build numbers are correct. Generated binaries are ignored in Git.

## Performance changes

Auto-cross spacing: 70 → 18 ms; test-cat waves: 40 → 14 ms; board diagonal spacing: 28 → 12 ms. Screen transitions: 160/240 → 100/160 ms. Win card: 1700 → 1200 ms. Confetti: 80 → 32 pieces, removed after the effect completes. Board cats retain placement/pet feedback while independent idle timers are disabled. Ambient colour remains static. Backgrounding pauses CSS effects, music scheduling and the game clock, and flushes board persistence. Fonts are bundled with their OFL license.

No device FPS guarantee is implied: final release builds still need profiling and testing on a physical iPhone and a modest Android device. Browser smoke checks cover actual placement, automatic crossing, scoring, settings and localization. Unit tests cover the level-5/6 helper boundary and native music suspension/resumption.

## Store materials

- `store/en/listing.json` and `store/ar/listing.json`: localized copy.
- `store/app-store-icon.png`: 1024×1024 opaque icon.
- `store/google-play-icon.png`: 512×512 icon.
- `store/google-play-feature.png`: 1024×500 feature graphic.
- `screenshots/ios/ar`: real 1206×2622 screenshots from the iPhone simulator, converted to opaque PNG. No fabricated gameplay.
- `screenshots/google-play`: actual web-game captures of the same bundled Vue game, exported at 1080×1920. Raw originals are retained in `screenshots/raw`.
- `store/privacy-disclosures.json`: disclosure basis from this version's actual implementation.

Public support: games@feeef.org. The owner supplied the private Apple review contact; it has been entered in App Store Connect and is not stored in source.

Hosted privacy: https://mohamadlounnas.github.io/ludu-vuejs/privacy.html
Hosted support: https://mohamadlounnas.github.io/ludu-vuejs/support.html
Apple console: https://appstoreconnect.apple.com/apps/6829094437/distribution

## Publishing status

Do not treat a successful local build, an uploaded binary, or a draft listing as publication. Both stores must accept the submission and release it. The owner approved Google Play's export-law declaration and Apple's privacy-label declaration. Both were applied. Review contact details and any remaining store questionnaires must be completed truthfully; do not invent an age rating or claim testing that has not been performed.

Apple submission: version 1.0.0 (build 2), Waiting for Review, automatic release after approval. Initial Apple availability excludes mainland China and Vietnam; Mac and Vision Pro distribution are disabled.

Google Play: production version 1.0.0 (2) sent for review under Physia.dev. Automatic pre-review checks run before the review queue. Managed publishing is off, so the release publishes automatically after approval. Initial availability excludes mainland China and Vietnam.
