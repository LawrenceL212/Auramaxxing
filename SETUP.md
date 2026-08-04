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

## Ideas for what you mentioned building next
- Weekly workout templates / a planner view
- Rest-day tracking so streaks don't punish planned rest
- Comments or reactions on teammates' logged workouts
- Personal-record tracking per exercise
