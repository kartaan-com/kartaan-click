// ─── Kartaan Click — the panel page, put together (R496): top bar, Printing / Status / last runs, then Tools ───
'use strict';
const version = el('span', 'p-what', 'Version ' + chrome.runtime.getManifest().version);
version.style.marginLeft = 'auto';
const bar = el('div', 'p-bar', null, [el('span', 'p-brand', 'Kartaan Click'), el('span', 'p-what', 'Free workflow fixes for seller and warehouse tools'), version]);
const printing = el('div', 'p-body');
printing.style.padding = '0';
const body = el('div', 'p-body', null, [printing, toolsCard(), el('p', 'p-note', 'More tools coming. ', [Object.assign(el('a', '', 'kartaan.com'), { href: 'https://kartaan.com', target: '_blank', rel: 'noopener' })])]);
document.body.appendChild(el('div', 'p-page', null, [bar, body]));
const said = el('p', 'p-said');
printingCards(printing, said);
chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === 'local' && PRINT_KEYS.some(k => changes[k])) || (area === 'session' && changes.kcAiDrive)) printingCards(printing, said);
});
