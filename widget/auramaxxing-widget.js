/* =========================================================================
   AURAMAXXING — iOS HOME SCREEN WIDGET
   Runs in Scriptable (free, App Store). Setup: ../widget/README.md

   WHY THIS IS A SCRIPTABLE SCRIPT AND NOT PART OF THE APP
   iOS home screen widgets are WidgetKit, and WidgetKit is native Swift only.
   A PWA — which is what Auramaxxing is — cannot publish one at any price.
   The only ways to get a real widget onto an iPhone home screen are a native
   app through the App Store, or a host app that runs scripts. Scriptable is
   the second, and it is free.

   WHY IT NEEDS NO LOGIN, NO NETWORK AND NO BACKEND
   A countdown is arithmetic on a date. It does not need your training record,
   so this script never touches Firestore, never holds a credential, and works
   in airplane mode. Progress figures are optional and pasted in; the date is
   the part that matters and the part that is always right.
   ========================================================================= */

/* ── CONFIG ────────────────────────────────────────────────────────────────
   In the app: open a directive, tap "Copy widget config", paste it over the
   DIRECTIVES array below. Or just type it by hand — it is only dates.

   title  — what you are training for
   date   — YYYY-MM-DD, the deadline
   why    — the reason you set it (this is the whole point; do not skip it)
   now    — optional, current progress
   target — optional, what you are aiming at
   unit   — optional, e.g. "km"                                            */

const DIRECTIVES = [
  { title: "Run a half marathon",
    date:  "2026-11-01",
    why:   "Because I said I would, and I keep my word.",
    now:   12.5, target: 21.1, unit: "km" },

  { title: "See her again",
    date:  "2026-12-20",
    why:   "Be someone I am proud of when I walk through that door." },
];

/* Colours lifted from the app so the widget reads as part of it. */
const BG_TOP   = new Color("#0A0E18");
const BG_BOT   = new Color("#05070D");
const BRASS    = new Color("#FFD66B");
const TEXT     = new Color("#E8EDF7");
const DIM      = new Color("#8A97AD");
const FAINT    = new Color("#5A677A");
const URGENT   = new Color("#FF6B6B");
const GOOD     = new Color("#6BCB77");

/** The deadline is the END of the target day — race morning is not missed. */
function countdown(dateStr, now = new Date()) {
  const end = new Date(dateStr + "T23:59:59.999");
  if (isNaN(end.getTime())) return null;
  const ms = end.getTime() - now.getTime();
  const abs = Math.abs(ms);
  return {
    past: ms < 0,
    days: Math.floor(abs / 86400000),
    hours: Math.floor((abs % 86400000) / 3600000),
    minutes: Math.floor((abs % 3600000) / 60000),
  };
}

/** Big number + its unit, so the widget can size the two differently. */
function headline(c) {
  if (!c) return { n: "—", unit: "" };
  if (c.past) return { n: String(c.days), unit: c.days === 1 ? "day past" : "days past" };
  if (c.days === 0) return { n: String(c.hours), unit: c.hours === 1 ? "hour left" : "hours left" };
  return { n: String(c.days), unit: c.days === 1 ? "day left" : "days left" };
}

function accentFor(c) {
  if (!c) return DIM;
  if (c.past) return URGENT;
  if (c.days <= 7) return URGENT;
  if (c.days <= 30) return BRASS;
  return BRASS;
}

function backdrop(w) {
  const g = new LinearGradient();
  g.colors = [BG_TOP, BG_BOT];
  g.locations = [0, 1];
  w.backgroundGradient = g;
}

/** A thin progress bar drawn to an image — Scriptable has no bar primitive. */
function progressBar(pct, width, height, colour) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  ctx.setFillColor(new Color("#5BA8FF", 0.16));
  ctx.fillRect(new Rect(0, 0, width, height));
  const fill = Math.max(0, Math.min(1, pct)) * width;
  if (fill > 0) {
    ctx.setFillColor(colour);
    ctx.fillRect(new Rect(0, 0, fill, height));
  }
  return ctx.getImage();
}

function addDirective(w, d, { big, showWhy, showBar, barWidth }) {
  const c = countdown(d.date);
  const h = headline(c);
  const accent = accentFor(c);

  const eyebrow = w.addText("◈ " + (d.title || "DIRECTIVE").toUpperCase());
  eyebrow.font = Font.mediumSystemFont(big ? 9 : 8.5);
  eyebrow.textColor = DIM;
  eyebrow.lineLimit = 1;
  w.addSpacer(big ? 6 : 3);

  // The number carries the message, so it is sized like a headline.
  const row = w.addStack();
  row.centerAlignContent();
  const num = row.addText(h.n);
  num.font = Font.boldSystemFont(big ? 42 : 30);
  num.textColor = accent;
  num.minimumScaleFactor = 0.6;
  row.addSpacer(5);
  const unit = row.addText(h.unit);
  unit.font = Font.mediumSystemFont(big ? 12 : 10);
  unit.textColor = DIM;

  if (showBar && Number(d.target) > 0) {
    const pct = (Number(d.now) || 0) / Number(d.target);
    w.addSpacer(7);
    w.addImage(progressBar(pct, barWidth, 4, accent)).imageSize = new Size(barWidth, 4);
    w.addSpacer(4);
    const m = w.addText(
      `${(Number(d.now) || 0).toFixed(1)} / ${Number(d.target).toFixed(1)} ${d.unit || ""}`.trim());
    m.font = Font.regularSystemFont(9.5);
    m.textColor = FAINT;
  }

  /* The reason, last and quiet, but present. A widget that shows only a number
     tells you that time is passing. It is the sentence underneath that tells
     you why you should care, and that is the part being forgotten. */
  if (showWhy && d.why) {
    w.addSpacer(big ? 8 : 5);
    const why = w.addText("“" + d.why + "”");
    why.font = Font.italicSystemFont(big ? 11 : 9.5);
    why.textColor = TEXT;
    why.lineLimit = big ? 3 : 2;
    why.minimumScaleFactor = 0.85;
  }
}

function buildWidget() {
  const family = config.runsInWidget ? config.widgetFamily : "medium";
  const w = new ListWidget();
  backdrop(w);
  w.setPadding(13, 14, 13, 14);
  w.url = "https://auramaxxing.web.app";   // tapping the widget opens the app

  const list = DIRECTIVES.filter((d) => d && d.title && d.date);
  if (!list.length) {
    const t = w.addText("No directive set");
    t.font = Font.mediumSystemFont(13);
    t.textColor = DIM;
    const s = w.addText("Open Auramaxxing and name what you are training for.");
    s.font = Font.regularSystemFont(10);
    s.textColor = FAINT;
    return w;
  }

  /* Soonest first: the widget should show the thing closest to being decided,
     not whichever happened to be typed first. */
  list.sort((a, b) => a.date.localeCompare(b.date));

  if (family === "small") {
    addDirective(w, list[0], { big: false, showWhy: true, showBar: false, barWidth: 120 });
  } else if (family === "large") {
    list.slice(0, 3).forEach((d, i) => {
      if (i) {
        w.addSpacer(10);
        const rule = w.addStack();
        rule.size = new Size(0, 1);
        rule.backgroundColor = new Color("#FFD66B", 0.14);
        w.addSpacer(10);
      }
      addDirective(w, d, { big: i === 0, showWhy: true, showBar: true, barWidth: 300 });
    });
    w.addSpacer();
  } else {
    addDirective(w, list[0], { big: true, showWhy: true, showBar: true, barWidth: 300 });
    if (list[1]) {
      w.addSpacer(9);
      const c2 = countdown(list[1].date);
      const h2 = headline(c2);
      const next = w.addText(`Next · ${list[1].title} — ${h2.n} ${h2.unit}`);
      next.font = Font.regularSystemFont(9.5);
      next.textColor = FAINT;
      next.lineLimit = 1;
    }
  }
  return w;
}

const widget = buildWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  // Tapping the script in the app previews it at every size.
  await widget.presentMedium();
}
Script.complete();
