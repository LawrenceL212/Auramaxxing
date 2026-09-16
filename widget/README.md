# Auramaxxing — iPhone home screen widget

A countdown to your directives, on your home screen. The number, the reason you
set it, and how far along you are.

```
┌────────────────────────────────┐
│ ◈ RUN A HALF MARATHON          │
│                                │
│  46  days left                 │
│  ▓▓▓▓▓▓▓░░░░░░░░               │
│  12.5 / 21.1 km                │
│                                │
│  “Because I said I would.”     │
│  Next · See her again — 95 d   │
└────────────────────────────────┘
```

## First, the thing you need to know

**Auramaxxing cannot ship an iPhone widget by itself, and no amount of work on
the app will change that.**

iOS home screen widgets are built with WidgetKit, which is native Swift only.
Auramaxxing is a PWA — a web app — and Apple gives web apps no access to
WidgetKit at any price. There are exactly two ways onto an iPhone home screen:

1. **A native Swift app** — a Mac, Xcode, a rewrite of the app's data layer in
   Swift, an Apple Developer account at £79/year, and App Store review. Weeks of
   work, and a second codebase to keep in step with this one forever.
2. **A host app that runs scripts** — Scriptable, which is free. Ten minutes.

This is route 2. It is not a compromise for the countdown specifically: a
countdown is arithmetic on a date, so a script does it exactly as well as native
code would.

## Setup (about ten minutes, once)

1. Install **[Scriptable](https://apps.apple.com/app/scriptable/id1405459188)**
   from the App Store. Free, no account.
2. Open Scriptable, tap **+** (top right) to create a new script.
3. Paste in the whole of [`auramaxxing-widget.js`](auramaxxing-widget.js).
4. Name it **Auramaxxing** — tap the title bar at the top to rename.
5. In Auramaxxing, open a directive → **📱 Widget config** → paste it over the
   `DIRECTIVES = [...]` block near the top of the script.
6. Tap **Done**. Run the script once (▶) to check it looks right.
7. On your home screen: long-press → **+** → search **Scriptable** → pick a size
   → **Add Widget**.
8. Long-press the new widget → **Edit Widget** → **Script: Auramaxxing**. Set
   **When Interacting** to **Run Script** if you want it to open the app.

## Sizes

| Size | Shows |
|---|---|
| **Small** | The soonest directive: countdown and your reason |
| **Medium** | The above plus a progress bar, and the next directive on one line |
| **Large** | Up to three directives in full |

Medium is the one to start with. It fits the reason without truncating it.

## Keeping it current

The **date** never goes stale — the countdown recalculates every time iOS
refreshes the widget, with no network and no login.

The **progress numbers** are a snapshot from when you copied the config. Re-copy
it whenever you want them caught up, or leave them off entirely and let the
widget be a pure countdown. Nothing breaks either way.

## What it does not do

- **No login, no network, no Firestore.** A countdown does not need your
  training record, so the script never holds a credential and works in airplane
  mode. Nothing you paste in leaves your phone.
- **It cannot notify you.** Widgets are passive — they show, they do not push.
  For actual alerts use **📅 Remind me** in the app, which puts your directives
  in your calendar with alarms 30, 7 and 1 days out. That is the thing that
  reaches you when the app has been closed for a fortnight.
- **iOS decides when to refresh it**, typically every 15–60 minutes. A day
  counter does not need more, but do not expect a ticking clock.

## Android

Scriptable is iOS-only. The equivalents are **KWGT** or **Tasker**, and the
script would need rewriting for them. The calendar export works everywhere.
