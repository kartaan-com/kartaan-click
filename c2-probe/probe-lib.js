// Kartaan Click TEST copy, piece C2-0. Written by Claude Sonnet 5.5 (R487 run 1), not DeepSeek (no balance, D1187/D740).
// Method: wrapping URL.createObjectURL in the page's own world = IDEA ONLY (standard browser technique), no outside code installed.
// Everything here only WATCHES. Nothing clicks, nothing is sent anywhere (NET-OK: nowhere; the one fetch, in
// background.js, is only for a label address on flipkart.com and only if the blob route did not catch it).
'use strict';

const PROBE_CAP_BYTES = 2 * 1024 * 1024;    // a label is ~100 KB; anything over 2 MB is refused
const PROBE_TTL_MS = 10 * 60 * 1000;        // armed for 10 minutes, then the watcher passes everything through

// True only for real PDF bytes: starts with "%PDF" and is within the size cap.
function checkPdf(bytes, cap) {
  const max = cap || PROBE_CAP_BYTES;
  if (!bytes || bytes.length < 5 || bytes.length > max) return false;
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

// Flipkart order ids look like OD + digits. Best effort; null when the text has none.
function findOrderId(text) {
  const m = /\bOD\d{12,24}\b/.exec(String(text || ''));
  return m ? m[0] : null;
}

// Address without its query/fragment, so nothing secret is stored or shown.
function safeAddress(u) {
  try { const x = new URL(u); return x.protocol + '//' + x.host + x.pathname; } catch (e) { return 'unreadable address'; }
}

// Runs INSIDE the page (world MAIN), injected by background.js (top frame only) with a one-time token as an argument.
// The token only keeps other extensions and frames from making noise: the PAGE can read it, so everything this sends
// is untrusted page data and the worker keeps its powers small (no fetch, PDF check, size cap, one copy).
// Self-contained on purpose: it is serialised and shipped as text, so it may not use anything outside itself.
function kcProbeWatcher(token, cap, ttlMs) {
  const until = Date.now() + ttlMs;
  let spent = false;
  const post = (o) => { try { window.postMessage(Object.assign({ kcProbe: token }, o), window.location.origin); } catch (e) {} };
  const live = () => !spent && Date.now() < until;
  const origCreate = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    const out = origCreate.apply(this, arguments);   // the page always gets exactly what it would have got
    try {
      if (live() && obj && typeof obj.size === 'number') {
        const type = obj.type || '';
        const size = obj.size;
        obj.slice(0, 5).arrayBuffer().then((head) => {
          const h = new Uint8Array(head);
          const isPdf = h[0] === 0x25 && h[1] === 0x50 && h[2] === 0x44 && h[3] === 0x46;
          if (!live()) return;
          if (!isPdf || size > cap) { post({ kind: 'seen', type, size, pdf: isPdf, tooBig: size > cap }); return; }
          obj.arrayBuffer().then((buf) => {
            if (!live()) return;
            const u8 = new Uint8Array(buf);
            let s = '';
            for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
            spent = true;                                   // one PDF per arming
            URL.createObjectURL = origCreate; window.open = origOpen; HTMLAnchorElement.prototype.click = origClick;   // put the page's own functions back
            post({ kind: 'pdf', via: 'blob', type, size, b64: btoa(s) });
          }).catch(() => {});
        }).catch(() => {});
      }
    } catch (e) {}
    return out;
  };
  // Fallback route: the page opens or clicks a normal https address instead of a blob.
  const looksLikeLabel = (u) => typeof u === 'string' && /^https:/i.test(u) && /pdf|label/i.test(u);
  const origOpen = window.open;
  window.open = function (u) { try { if (live() && looksLikeLabel(String(u))) post({ kind: 'url', url: String(u) }); } catch (e) {} return origOpen.apply(this, arguments); };
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { try { if (live() && looksLikeLabel(this.href)) post({ kind: 'url', url: this.href }); } catch (e) {} return origClick.apply(this, arguments); };
  return 'watching';
}

// Runs in the extension's own (isolated) content-script world: checks the token, reads the order id the user pressed on, hands over to the worker.
function kcProbeRelay(token, ttlMs) {
  let spent = false, order = null;
  const until = Date.now() + ttlMs;
  const onClick = (ev) => {
    if (spent || Date.now() > until) return;
    try {
      let el = ev.target, text = '';
      for (let i = 0; el && i < 12; i++, el = el.parentElement) {
        const m = /\bOD\d{12,24}\b/.exec((el.innerText || '').slice(0, 4000));
        if (m) { order = m[0]; return; }
      }
    } catch (e) {}
  };
  document.addEventListener('click', onClick, true);   // only reads where he pressed; never clicks anything
  const onMsg = (e) => {
    const d = e.data;
    if (Date.now() > until) { window.removeEventListener('message', onMsg); document.removeEventListener('click', onClick, true); return; }
    if (e.source !== window || spent || !d || typeof d !== 'object' || d.kcProbe !== token) return;
    if (d.kind === 'pdf' || d.kind === 'url') { spent = true; window.removeEventListener('message', onMsg); document.removeEventListener('click', onClick, true); }
    const send = { type: 'KC_PROBE', kind: d.kind, order };
    if (d.kind === 'pdf') { if (typeof d.b64 !== 'string') return; send.b64 = d.b64; send.size = d.size; send.btype = String(d.type || '').slice(0, 60); send.via = 'blob'; }
    else if (d.kind === 'url') { if (typeof d.url !== 'string') return; send.url = d.url.slice(0, 2000); }
    else if (d.kind === 'seen') { send.btype = String(d.type || '').slice(0, 60); send.size = Number(d.size) || 0; send.pdf = !!d.pdf; send.tooBig = !!d.tooBig; }
    else return;
    try { chrome.runtime.sendMessage(send); } catch (err) {}
  };
  window.addEventListener('message', onMsg);
  return 'relay';
}

const api = { PROBE_CAP_BYTES, PROBE_TTL_MS, checkPdf, findOrderId, safeAddress, kcProbeWatcher, kcProbeRelay };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else Object.assign(globalThis, api);
