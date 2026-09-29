/* Site configuration. Edit this file per deployment; nothing else needs to change.

   leadTrackerSrc: URL of the lead-capture script. Empty = no tracker, the forms show
   an "offline" message and nothing leaves the browser. The script must define
   window.leadTracker with this interface:
     lead({ name, phone, email?, comment?, unit_id?, interest, source }) -> Promise<{ ok?, queued?, error? }>
     units(callback)  calls callback({ [unitId]: 'available' | 'reserved' | 'sold' })
   Example: leadTrackerSrc: '/crm/track.js' */
window.SITE_CONFIG = {
  leadTrackerSrc: ''
};

(function () {
  const src = window.SITE_CONFIG.leadTrackerSrc;
  if (!src) return;
  const s = document.createElement('script');
  s.src = src; s.async = true;
  document.head.appendChild(s);
})();
