# Auramaxxing — setup

## 1. Create a Firebase project
1. Go to https://console.firebase.google.com → **Add project**.
2. Once created, click the **web (`</>`)** icon to register a web app.
3. Copy the `firebaseConfig` object it gives you.

## 2. Paste your config
Open `index.html`, find this block near the top of the `<script type="module">` section, and replace the placeholder values:

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

## 3. Turn on Auth
Firebase console → **Build → Authentication → Sign-in method** → enable **Email/Password**.

## 4. Turn on Firestore
Firebase console → **Build → Firestore Database → Create database** (start in production mode).

Then go to the **Rules** tab and paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    match /workouts/{workoutId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.uid == request.auth.uid;
      allow update, delete: if request.auth != null && resource.data.uid == request.auth.uid;
    }

    match /programs/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    match /customExercises/{exerciseId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.addedBy == request.auth.uid;
      allow update, delete: if request.auth != null && resource.data.addedBy == request.auth.uid;
    }

    match /bodyweight/{entryId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.uid == request.auth.uid;
      allow update, delete: if request.auth != null && resource.data.uid == request.auth.uid;
    }
  }
}
```

This lets everyone in your Firebase project see each other's names, streaks and workouts (needed for the leaderboard, today's check-ins, and history), but only edit their own data.

## 5. Host it
Anything that serves static files works. Easiest is Firebase Hosting itself:

```
npm install -g firebase-tools
firebase login
firebase init hosting     # point the public directory at this folder
firebase deploy
```

Or just drag the folder into Netlify/Vercel, or open `index.html` locally to test (Firebase Auth/Firestore still work over plain file access, but installing as a PWA requires being served over HTTPS).

## 6. Invite your crew
Everyone just opens the URL and taps **Create an account**. There's no invite code — anyone with your Firebase project's config (i.e. anyone using this deployed URL) can sign up, so keep the link semi-private if you don't want strangers joining the leaderboard.

## How the muscle status logic works
Each exercise in the `EXERCISES` object near the top of the script maps to one or more muscles with a relative emphasis (0–1). Volume per set is `reps × weight`, multiplied by that emphasis and summed per muscle.

For each muscle, this week's volume is compared to the average of your prior 3 weeks:
- **0 this week** → Stalled
- **No prior history, but training it now** → Focusing
- **≥140% of your average** → Excess
- **115–140%** → Growing
- **85–115%** → Maintaining
- **below 85%** → Stalled

Tweak the thresholds or add exercises directly in the `EXERCISES` object — everything else (heatmap, breakdown list) reads from it automatically.

## The muscle map now needs one more file
`anatomy.svg` must sit right next to `index.html` (same folder, both at the root of what you deploy). It's your traced front/back muscle illustration — the app fetches it at load time and recolors each named shape based on training status.

Two things that follow from that:
- **It won't load if you just double-click `index.html` and open it as a local file** — browsers block `fetch()` of local files from `file://` pages for security reasons. To test locally, run a tiny local server from that folder instead, e.g. `python3 -m http.server 8000` then visit `http://localhost:8000`. Once deployed to GitHub Pages / Firebase Hosting (real `https://`), this isn't an issue at all.
- If the fetch fails for any reason (missing file, wrong path), the Muscle Activation card just shows a "Loading anatomy…" placeholder instead of crashing the rest of the app.

The muscle taxonomy is now 21 regions instead of the original 12 (Upper/Middle/Lower Chest, Front/Lateral/Rear Shoulders, Traps, Lats, Upper/Lower Back, Biceps, Triceps, Forearms, Upper/Middle/Lower Abs, Obliques, Glutes, Hamstrings, Quads, Calves) — matching the shapes traced in `anatomy.svg`. If you add more custom exercises, target these exact names in the muscle picker.

## Data model
Five collections now back the app:
- `users/{uid}` — profile + `weeklyGoal` (used by the Streaks widget)
- `workouts/{autoId}` — one doc per logged session (`uid`, `date`, `time`, `exercises`)
- `programs/{uid}` — one active split per user: `{ name, days: [{ name, tag, exercises, lastDate }], currentDayIndex }`
- `customExercises/{autoId}` — exercises added from the Exercises tab, merged into everyone's move list
- `bodyweight/{autoId}` — bodyweight log entries for the Trends weight widget

## What's in the app now
- **Quest tab** — build a multi-day program, rotate through it day by day, "Start" pre-fills the logger with that day's exercises, or just log an ad-hoc session any time
- **Rank tab** — today's check-ins, hunter rank (E–S) by streak, full guild leaderboard
- **Trends tab** — Muscle Activation (Past vs. Planned, front/back body map, per-muscle breakdown with a 4-week spark bar), Streaks, a 12-week Consistency grid, Volume vs. 4-week average, Training Days, Training Months, Bodyweight tracking, and Training Hours
- **Moves tab (Exercises)** — search, filter by muscle or equipment, and add your own custom exercises with their own muscle map
- **Log tab (History)** — a real calendar with dots on days you trained, tap any date to see who logged what

## Ideas for what's still missing
- Reordering/hiding Trends widgets ("Edit Widgets")
- Supersets / rest timers inside the logger
- Personal-record tracking per exercise
- Comments or reactions on teammates' logged workouts