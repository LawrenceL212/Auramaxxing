/* =========================================================================
   NOTIFICATION OPTIONS: how a reminder looks and where a tap goes

   Pure and written as a classic script (no import/export) so the service
   worker can importScripts() it and Node tests can require() it.

   The sender ships a data-only push { type, title, body, tag, icon, badge }.
   The service worker turns it into showNotification() arguments here, and
   turns a click (on the notification or on one of its Android buttons) into
   a deep link the app understands: index.html?go=hunt or ?go=quick.

   All URLs are RELATIVE to the service worker scope, so the app works under a
   GitHub Pages project path (/Auramaxxing/) as well as at a domain root.
   iOS ignores action buttons, so tapping the notification itself must do the
   useful thing: it opens the Hunt screen.
   ========================================================================= */
(function (root) {
  var ICON = 'icons/notify-192.png';
  var BADGE = 'icons/notify-badge-96.png';
  var ACTIONS = [
    { action: 'hunt', title: 'Begin Hunt' },
    { action: 'quick', title: 'Quick 15' },
  ];

  /** Resolve a path against the SW scope; never produces a root-absolute URL. */
  function scoped(rel, scope) {
    var clean = String(rel || '').replace(/^\/+/, '');
    return scope ? new URL(clean, scope).href : clean;
  }

  /** @returns {{title:string, options:object}} for registration.showNotification */
  function buildNotification(data, scope) {
    var d = data || {};
    var opts = {
      body: String(d.body || ''),
      icon: scoped(d.icon || ICON, scope),
      badge: scoped(d.badge || BADGE, scope),
      tag: d.tag || 'aura-reminder',   // same tag replaces instead of stacking
      renotify: true,                  // ...and still buzzes when it replaces
      requireInteraction: false,
      actions: d.type === 'test' ? [] : ACTIONS.map(function (a) { return { action: a.action, title: a.title }; }),
      data: { type: d.type || '', local: !!d.local },
    };
    return { title: String(d.title || '[SYSTEM] Notice'), options: opts };
  }

  /** 'quick' for the Quick 15 button, otherwise 'hunt' (the notification body, the Begin Hunt button, iOS). */
  function goFor(action) { return action === 'quick' ? 'quick' : 'hunt'; }

  /** The app URL a click should open, relative to the SW scope. */
  function targetUrl(action, scope) {
    return scoped('index.html?go=' + goFor(action), scope);
  }

  var api = { buildNotification: buildNotification, goFor: goFor, targetUrl: targetUrl, ICON: ICON, BADGE: BADGE, ACTIONS: ACTIONS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AuraNotify = api;
})(typeof self !== 'undefined' ? self : this);
