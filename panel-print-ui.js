// ─── Kartaan Click — the panel's Printing, Status and last-runs cards (R496, his D1300) ───
// What each box shows comes from panel-print.js; the page helpers (el, button, tile, state, store) are panel.js's.
'use strict';

const PRINT_KEYS = ['kcPrintTimes', 'kcCutoff', 'kcPrintNext', 'kcPrintLog', 'kcReloadedTo'];
const nameOf = p => p.charAt(0).toUpperCase() + p.slice(1);
const when = ms => new Date(ms).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const COLOUR = { meesho: '--meesho', flipkart: '--flipkart', amazon: '--amazon' };

// One saved print-times record per platform: { times, mode }. The mode is the whole print step's switch (print-flow.js).
async function savePrintTimes(p, patch) {
  const all = (await store('kcPrintTimes')).kcPrintTimes || {};
  all[p] = { ...(all[p] || {}), ...patch };
  await chrome.storage.local.set({ kcPrintTimes: all });
}

// Opens the Settings page at the Cutoff reminders card (openOptionsPage cannot jump to a card, so the page is opened by its address).
const openCutoffSettings = () => chrome.tabs.create({ url: cutoffSettingsUrl(chrome.runtime.getURL('options.html')) });

function platformBox(p, saved, said) {
  const v = platformView(saved, p, when);
  const chips = v.times.map(t => el('span', 'p-chip', t, [button('✕', 'k-button--quiet k-button--small', async () => { await savePrintTimes(p, { times: removeTime(v.times, t) }); })]));
  const input = el('input', 'k-control'); input.type = 'time'; input.setAttribute('aria-label', 'add a ' + nameOf(p) + ' print time');
  const add = button('Add', 'k-button--quiet k-button--small', async () => {
    const r = addTime(v.times, input.value);
    if (r.error) { said.textContent = nameOf(p) + ': ' + r.error; return; }
    await savePrintTimes(p, { times: r.times });
  });
  const now = button('Print now', 'k-button--main', async () => {
    now.disabled = true; said.textContent = nameOf(p) + ': starting…';
    chrome.runtime.sendMessage({ type: 'KC_PRINT_NOW', platform: p }, r => {
      void chrome.runtime.lastError; now.disabled = false;
      said.textContent = r && r.ok ? nameOf(p) + (r.waiting ? ': the Label Cropper is busy — Click tries again in a minute.' : ': print started — see the notice.') : nameOf(p) + ': ' + ((r && r.reason) || 'Click did not answer.');
    });
  });
  const box = el('div', 'p-platform', null, [el('div', 'p-platform-name', nameOf(p)),
    el('div', 'p-kv', null, [el('span', '', 'Cutoff'), (v.cutoff ? el('span', '', v.cutoff) : button('Not set — set it in Settings', 'k-button--quiet k-button--small', openCutoffSettings)), el('span', '', 'Last print run'), el('span', '', v.last), el('span', '', 'Next print'), el('span', '', v.next)]),
    el('div', 'p-row', null, [el('span', 'p-label', 'Print times'), ...chips, input, add])].concat(
      v.needsCutoff ? [state('Without a cutoff nothing prints.', 'no'), button('Set the cutoff', 'k-button--quiet k-button--small', openCutoffSettings)] : [], [el('div', 'p-actions', null, [now])]));
  box.style.borderLeft = '4px solid var(' + COLOUR[p] + ')';
  return box;
}

function printingCard(saved, said) {
  const mode = el('select', 'k-control');
  for (const [k, label] of Object.entries(PRINT_MODE_LABELS)) { const o = el('option', '', label); o.value = k; mode.appendChild(o); }
  const current = ['meesho', 'flipkart', 'amazon'].map(p => ((saved.kcPrintTimes || {})[p] || {}).mode).find(Boolean) || 'silent';
  mode.value = current;
  mode.addEventListener('change', async () => { for (const p of ['meesho', 'flipkart', 'amazon']) await savePrintTimes(p, { mode: mode.value }); });
  return el('div', 'p-card', null, [el('h2', 'p-title', 'Printing, by platform'),
    el('p', 'p-note', 'At each print time Click makes the labels for everything due by the next cutoff and prints them. It waits while you are using the computer. If the computer was off at a print time, it asks you instead of printing late.'),
    el('div', 'p-grid', null, ['meesho', 'flipkart', 'amazon'].map(p => platformBox(p, saved, said))),
    el('div', 'p-row', null, [el('span', 'p-label', 'How labels reach paper'), mode]),
    el('p', 'p-note', 'Straight away needs Chrome started with the kiosk-printing setting; without it Chrome shows its own print box. Up to 6 times a day per platform.'), said]);
}

function statusCard(saved, res) {
  const cr = cropperView(saved.kcPrintLog);
  const rows = el('div', 'p-kv', null, [el('span', '', 'Label Cropper'), state(cr.text, cr.ok === null ? '' : cr.ok ? 'yes' : 'no'),
    el('span', '', 'Click version'), el('span', '', chrome.runtime.getManifest().version), el('span', '', 'Reload'), el('span', '', reloadView(res, chrome.runtime.getManifest().version))]);
  return el('div', 'p-card', null, [el('h2', 'p-title', 'Status'), rows]);
}

function runsCard(saved) {
  const lines = logLines(saved.kcPrintLog, when);
  const log = el('pre', 'p-log', lines.length ? lines.join('\n') : 'Nothing has printed yet.');
  return el('div', 'p-card', null, [el('h2', 'p-title', 'What the last runs did'), log,
    el('div', 'p-actions', null, [button('Clear this list', 'k-button--quiet k-button--small', () => chrome.storage.local.remove('kcPrintLog'))])]);
}

// The switch (R051): while it is on, the AI app on this computer may change cutoffs, press Print now and reload Click, through Kartaan's local helper.
async function aiCard() {
  const s = (await chrome.storage.session.get('kcAiDrive')).kcAiDrive, on = !!(s && s.on);
  const toggle = button(on ? 'Stop' : 'Let my AI drive Click', on ? 'k-button--quiet k-button--small' : 'k-button--main', () => chrome.runtime.sendMessage({ type: 'KC_AI_SET', on: !on }, () => void chrome.runtime.lastError));
  return el('div', 'p-card', null, [el('h2', 'p-title', 'AI may drive'),
    el('p', 'p-note', on ? 'AI is driving Click. It can set cutoffs, press Print now and reload Click. It stops by itself 60 minutes after its last call, or when you press Stop.'
                         : 'Off. Turn it on only when you want your AI app to use Click for you. It needs the Kartaan helper that Tune uses.'),
    el('div', 'p-actions', null, [toggle])]);
}

// The three cards, drawn again whenever the saved records change.
// `said` is made once by the caller: what a button said back stays on screen when the cards are drawn again.
async function printingCards(holder, said) {
  const saved = await store(PRINT_KEYS);
  holder.textContent = '';
  holder.append(printingCard(saved, said), statusCard(saved, saved), runsCard(saved), await aiCard());
}
