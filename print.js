// Shows one finished label PDF (the one numbered ?i= in session storage) in this tab, so the seller presses Print once.
'use strict';
(async () => {
  const i = Number(new URLSearchParams(location.search).get('i'));
  const all = (await chrome.storage.session.get('kcPrintPdfs')).kcPrintPdfs || [];
  if (!Number.isInteger(i) || typeof all[i] !== 'string') { document.body.textContent = 'These labels are no longer here. Run the print again.'; return; }
  const bytes = Uint8Array.from(atob(all[i]), c => c.charCodeAt(0));
  location.replace(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
})();
