// ─── Kartaan Click — the panel page (R496, his D1300): the helpers and the Tools card ───
// Built from nodes, never markup: text that came from somewhere else goes on the page as text.
// What each tool shows comes from panel-tools.js (the pop-up's own words and states, moved).
'use strict';

const el = (tag, cls, text, kids) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  for (const k of kids || []) e.appendChild(k);
  return e;
};
const state = (text, mode) => el('span', 'p-state' + (mode ? ' p-state--' + mode : ''), text);
const button = (text, cls, fn) => { const b = el('button', 'k-button ' + cls, text); b.type = 'button'; b.addEventListener('click', fn); return b; };
const tile = (name, note, kids) => el('div', 'p-platform', null, [el('div', 'p-platform-name', name), ...(note ? [el('p', 'p-note', note)] : []), ...kids]);
const openSettings = () => chrome.runtime.openOptionsPage();
const store = keys => chrome.storage.local.get(keys);
const STOP_HINT = 'It only works while a recording is actually running.';

function stopKeyRow() {
  const chip = el('span', 'p-chip', keyName()), note = el('p', 'p-note', STOP_HINT);
  store(STOP_KEY_SETTING).then(res => { chip.textContent = keyName(res[STOP_KEY_SETTING]); });
  const change = button('Change', 'k-button--quiet k-button--small', () => {
    change.disabled = true; chip.textContent = '…'; note.textContent = 'Press the key you want to use. Escape cancels.';
    const onKey = async e => {
      e.preventDefault(); e.stopPropagation(); document.removeEventListener('keydown', onKey, true);
      change.disabled = false;
      if (e.key === 'Escape') { chip.textContent = keyName((await store(STOP_KEY_SETTING))[STOP_KEY_SETTING]); note.textContent = STOP_HINT; return; }
      await chrome.storage.local.set({ [STOP_KEY_SETTING]: e.key });
      chip.textContent = keyName(e.key); note.textContent = keyHint(e.key);
    };
    document.addEventListener('keydown', onKey, true);
  });
  return [el('div', 'p-row', null, [el('span', 'p-label', 'Stop recording with a key'), chip, change]), note];
}

function updateTile() {
  const box = el('div', 'p-banner p-banner--idle', 'Checking for updates…');
  const show = info => {
    const v = updateView(info, ms => new Date(ms).toLocaleDateString());
    box.className = 'p-banner ' + (v.kind === 'new' ? 'p-banner--setup' : 'p-banner--idle'); box.textContent = '';
    for (const line of v.lines) box.appendChild(el('div', '', line));
    if (v.url) { const a = el('a', '', 'Download it'); a.href = v.url; a.target = '_blank'; a.rel = 'noopener'; box.appendChild(a); }
  };
  store('_updateInfo').then(res => { if (res._updateInfo) show(res._updateInfo); });
  chrome.runtime.sendMessage({ type: 'CHECK_UPDATE' }, info => { void chrome.runtime.lastError; show(info); });
  return tile('Updates', '', [box]);
}

// Copy product details: only the page in front, only when this is pressed. The panel is itself a tab, so "the page in front" is the
// active tab of another window; reading it needs the page's address, which Chrome gives for the seller sites Click already has access to.
function copyTile() {
  const msg = state('');
  const copy = button('Copy product details', 'k-button--ordinary', async () => {
    msg.textContent = 'Reading the page…';
    try {
      const tab = (await chrome.tabs.query({ active: true })).find(t => /^https:\/\/(www\.)?(amazon\.in|meesho\.com|flipkart\.com)\//i.test(t.url || ''));
      if (!tab) { msg.textContent = 'Open a product page on Amazon.in, Meesho or Flipkart first, then press this again.'; return; }
      const [run] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/product-reader.js'] });
      const r = run && run.result, said = copyMessage(r);
      if (said) { msg.textContent = said; return; }
      await navigator.clipboard.writeText(r.text);
      msg.textContent = 'Copied, now paste it into your chat.';
    } catch (e) { msg.textContent = 'Could not read or copy this page.'; }
  });
  return tile('Copy product details', 'Open a product page on Amazon.in, Meesho or Flipkart, press the button, and paste into ChatGPT, Gemini or Claude. It reads only the page you are looking at, only when you press.', [copy, msg]);
}

// A state line that fills in once its saved records are read.
function savedState(keys, toView) {
  const s = state('…');
  store(keys).then(res => { const v = toView(res); s.textContent = v.text; s.className = 'p-state p-state--' + (v.on ? 'yes' : 'no'); });
  return s;
}

function toolsCard() {
  const settings = () => button('Settings', 'k-button--quiet k-button--small', openSettings);
  const clock = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return el('div', 'p-card', null, [el('h2', 'p-title', 'Tools'), el('div', 'p-grid', null, [
    tile('VMS packing — auto-clear AWB', 'Stop a recording with a key instead of the mouse, and the AWB box empties itself and takes the cursor, so the next parcel scans straight in.',
      [state('Active on VMS screens', 'yes'), ...stopKeyRow()]),
    tile('Flipkart orders — one click at a time', "For the days when Flipkart's bulk actions don't go through. A panel works down the list for you: mark RTD, print labels, or accept orders. You press Start; it never runs on its own.",
      [state('Active on Flipkart Active Orders', 'yes')]),
    tile('Portal check-ins', "Opens Flipkart, Meesho and Amazon behind whatever you're doing, clicks through the order tabs the way you would, and leaves the tab open — so the portals see you checking in. Off until you switch it on.",
      [savedState(['kcCheckin', 'kcCheckinNext'], res => checkinView(res, clock)), settings()]),
    tile('Accepting orders', 'On Flipkart and Meesho, accepts the orders waiting for you — but only the SKUs you have ticked, only ones due soon enough, and only up to the daily number you set per SKU. Off until you switch it on, and it accepts nothing until you tick your SKUs.',
      [savedState(['kcAutoAccept', 'kcOrdersFilter'], acceptView), settings()]),
    copyTile(),
    updateTile(),
  ])]);
}

