# Trasset Mobile

React Native app for iOS and Android (SRS §12). It is **not a smaller
dashboard** — it exists for the work that happens away from a desk: scanning an
asset in front of you, handing equipment over on the spot, photographing damage,
and walking a stock room with no signal.

Anything better on a large screen — bulk import, report building, master data,
purchase-order editing — stays on the web, deliberately.

## Stack

| Concern | Choice |
|---|---|
| SDK | **Expo SDK 54** · React Native 0.81.4 · React 19.1.0 |
| Language | TypeScript (strict) |
| Navigation | **React Navigation** — native stack + bottom tabs (SRS §12.2) |
| Server state | TanStack Query |
| Secure storage | expo-secure-store — refresh tokens never touch AsyncStorage |
| Fonts | Quicksand + Lexend, bundled via `@expo-google-fonts` |

> **Note on navigation.** The build plan's Day 36 line says expo-router; SRS
> §12.2 says React Navigation. The SRS is the contract, so React Navigation it
> is. The navigation tree is unchanged either way.

## Running it

```bash
cd mobile
npm install
npm start           # QR code — scan it with Expo Go
```

Then open **Expo Go** on the phone and scan the QR code. Both devices must be
on the same Wi-Fi. If they are not, or the network blocks it:

```bash
npm run tunnel      # routes through Expo's relay — slower but works anywhere
```

Other entry points:

```bash
npm run android     # Android emulator
npm run ios         # iOS simulator (macOS only)
npm run tsc         # type-check without emitting
```

### Pointing at the backend

`src/config/env.ts` derives the API URL from the machine running the packager,
because a phone cannot reach `127.0.0.1` — that address is the phone itself.
So with the Django server running on your laptop it Just Works over Wi-Fi.

The backend must be listening on all interfaces, not just loopback:

```bash
cd backend
venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000
```

and your machine's LAN address needs to be in `ALLOWED_HOSTS`.

## Layout

```
mobile/
├─ App.tsx                 Entry: fonts, theme, navigation
├─ index.js                registerRootComponent
└─ src/
   ├─ config/              Environment and build-profile config
   ├─ theme/               Design tokens (light + dark) and the provider
   ├─ navigation/          RootNavigator, AppTabs
   ├─ screens/             One folder per feature as they land
   └─ components/          Shared primitives
```

## Design

Same brand as the web — Nest Green, Cream Yolk, Ink, Quicksand, Lexend — but
adapted to platform conventions rather than transplanted. Tokens live in
`src/theme/tokens.ts` and are documented, with their contrast measurements, in
[`../docs/Trasset_Design_Tokens.md`](../docs/Trasset_Design_Tokens.md).

**Dark mode is wired from the first screen.** Retrofitting it costs far more,
and every component written before it exists is one that has to be revisited.
