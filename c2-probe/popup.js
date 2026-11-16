'use strict';
const $ = id => document.getElementById(id);
async function show() {
  const s = (await chrome.storage.local.get('c2probe')).c2probe || { lines: [] };
  $('log').textContent = s.lines.join('\n') || '(nothing yet)';
}
$('arm').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const r = await chrome.runtime.sendMessage({ type: 'ARM', tabId: tab.id });
  $('msg').textContent = r && r.ok ? 'Armed.' : (r && r.why) || 'Could not arm.';
  show();
};
$('off').onclick = async () => { await chrome.runtime.sendMessage({ type: 'DISARM' }); show(); };
$('clr').onclick = async () => { await chrome.storage.local.set({ c2probe: { armed: null, lines: [] } }); chrome.action.setBadgeText({ text: '' }); show(); };
chrome.storage.onChanged.addListener(show);
show();
