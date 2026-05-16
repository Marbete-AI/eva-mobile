# EVA Mobile

React Native CLI (bare) app for EVA — the in-cabin AI co-pilot.

## Prerequisites

- Node.js >= 20
- Xcode (from Mac App Store) — required for iOS build
- CocoaPods (`brew install cocoapods`)
- Physical iPhone or iOS Simulator

## Setup

### 1. Install JS dependencies

```bash
npm install
```

### 2. Install iOS native dependencies

```bash
cd ios && pod install && cd ..
```

### 3. Environment variables

```bash
cp .env.example .env
# Edit .env — set API_URL to your backend address
```

For iOS Simulator: `API_URL=http://localhost:8787`

For physical device: `API_URL=http://<your-mac-local-ip>:8787`
Find your IP: System Settings → Wi-Fi → Details → IP Address

### 4. Xcode — one manual step (react-native-config)

react-native-config reads your .env at build time. You need to add one
build phase in Xcode so it picks up the file:

1. Open `ios/EVAMobile.xcworkspace` in Xcode
2. Select the EVAMobile target → Build Phases
3. Click `+` → New Run Script Phase
4. Move it above "Compile Sources"
5. Paste this script:
   ```
   "${SRCROOT}/../node_modules/react-native-config/ios/ReactNativeConfig/BuildXCConfig.rb" "${SRCROOT}/.." "${SRCROOT}/tmp.xcconfig"
   ```
6. Uncheck "Based on dependency analysis"

You only need to do this once.

### 5. Run

```bash
# iOS Simulator
npx react-native run-ios

# Specific simulator
npx react-native run-ios --simulator "iPhone 16"

# Physical device — open Xcode, select your device, hit Run
```

## Project structure

```
eva-mobile/
├── src/
│   ├── screens/
│   │   └── ChatScreen.tsx     # Main chat UI
│   ├── navigation/
│   │   └── RootNavigator.tsx  # React Navigation stack
│   └── lib/
│       ├── ws-client.ts       # WebSocket session client
│       └── api-client.ts      # HTTP fallback client
├── ios/                       # Native iOS project
├── android/                   # Native Android project
├── App.tsx                    # Entry point
└── .env                       # Local env (gitignored)
```

## Backend

The backend lives at `../eva/apps/server`. Start it before running the app:

```bash
cd ../eva
pnpm --filter @eva/adas-mock start -- --scenario late_braking &
pnpm --filter @eva/server dev
```

## Connection

The app connects to the backend via WebSocket at `ws://<API_URL>/session`.
If the WebSocket is unavailable it falls back to HTTP POST `/chat`.

The status badge in the top-right shows:
- Blue dot "Live" — WebSocket connected
- Amber dot "Reconnecting..." — connection lost, retrying
- Red dot "Connection error" — check backend is running
