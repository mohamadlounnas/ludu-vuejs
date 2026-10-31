# Cat Grid · شبكة القطط

An offline cat logic puzzle built with Vue 3 and TypeScript, packaged for iPhone and Android with Capacitor 8. Find one cat per row, column and coloured region; cats cannot touch, including diagonally.

## Develop

```sh
npm ci
npm run dev
```

Tap once to cross out a cell, double-tap to place a cat, or use test inks to explore a possibility. Automatic crossing is available only in the first five levels. Arabic and English, daily puzzles, local progress, sound, calm mode and region patterns are included.

## Verify and build

```sh
npm test
npm run build
npm run native:sync
npm run ios
npm run android
```

Native requirements: Xcode 26+ on macOS for iOS; Java 21 and Android SDK 36 for Android. Local play needs no Firebase project, server, account or internet connection. Fonts and artwork are bundled; font licenses are in `public/fonts/OFL.txt`.

`npm run assets` exports app icons and branded launch screens from the artwork in `assets/launch`. The Android signing helper reads credentials outside the repository; see [release instructions](release/README.md).

## Store materials

[Release documentation](release/README.md) contains build instructions, store listing locations, privacy disclosure basis, signing guidance and submission status. The app includes its privacy policy and help pages in Settings.

- [Privacy policy](https://mohamadlounnas.github.io/ludu-vuejs/privacy.html)
- [Support](https://mohamadlounnas.github.io/ludu-vuejs/support.html)
- Public contact: games@feeef.org

A successful build or upload does not mean a store release is live. Refer to the store consoles for review and availability status.
