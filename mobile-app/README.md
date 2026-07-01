# EcolPro Mobile — React Native / Expo

Application native iOS + Android pour EcolPro, construite avec Expo Router, NativeWind (Tailwind CSS), TanStack Query et Zustand.

## Architecture

```
mobile-app/
├── app/                    # Expo Router (file-based routing)
│   ├── _layout.tsx         # Root layout (providers, auth init)
│   ├── index.tsx           # Redirect based on auth state
│   ├── login.tsx           # Login screen
│   ├── (tabs)/             # Tab navigation
│   │   ├── _layout.tsx     # Tab bar config
│   │   ├── dashboard.tsx   # Home screen (stats, recent activity)
│   │   ├── eleves.tsx      # Student list (searchable)
│   │   ├── absences.tsx    # Absence list + stats
│   │   ├── notes.tsx       # Notes list (filterable by subject)
│   │   └── emploi-du-temps.tsx  # Timetable view
│   └── eleve/[id].tsx      # Student detail screen
├── lib/
│   ├── api.ts              # API client + SecureStore token management
│   ├── auth-store.ts       # Zustand auth state
│   └── utils.ts            # Shared utilities (cn, formatDate, etc.)
├── app.json                # Expo config
├── eas.json                # EAS Build/Submit config
├── tailwind.config.js      # NativeWind theme
├── metro.config.js         # Metro + NativeWind
└── package.json
```

## Setup

```bash
cd mobile-app
npm install

# Create .env from .env.example
cp .env.example .env
# Edit .env: EXPO_PUBLIC_API_URL=http://localhost:3000

# Start dev server
npx expo start
```

## Prerequisites

- Node.js 18+
- Expo CLI (`npm i -g expo-cli`)
- iOS Simulator (Xcode) or Android Studio emulator
- Expo Go app on your device (for physical testing)

## Backend API

The mobile app consumes dedicated mobile API endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/mobile` | POST | Login (returns JWT) |
| `/api/mobile/dashboard` | GET | Dashboard stats + recent activity |
| `/api/mobile/eleves` | GET | Student list (with search) |
| `/api/mobile/eleves/[id]` | GET | Student detail |
| `/api/mobile/absences` | GET | Absence list + stats |
| `/api/mobile/notes` | GET | Notes list + subjects + classes |
| `/api/mobile/emploi-du-temps` | GET | Timetable |

All `/api/mobile/*` endpoints require `Authorization: Bearer <token>` header.

## Build for stores

```bash
# Install EAS CLI
npm i -g eas-cli

# Login to Expo
eas login

# Configure project
eas build:configure

# Build for iOS
npm run build:ios

# Build for Android
npm run build:android

# Submit to stores
npm run submit:ios
npm run submit:android
```

## Tech Stack

- **Expo** ~52 (React Native 0.76)
- **Expo Router** v4 (file-based navigation)
- **NativeWind** v4 (Tailwind CSS for RN)
- **TanStack Query** v5 (data fetching + cache)
- **Zustand** v5 (auth state)
- **expo-secure-store** (JWT token storage)
- **lucide-react-native** (icons)
