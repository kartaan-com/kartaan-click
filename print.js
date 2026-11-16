// Shows one finished label PDF (number ?i= of the run named by ?k=, kept in session storage) in this page.
// With ?s=1 (silent print) it also asks Chrome to print it: Chrome started with the kiosk-printing setting prints at once,
// otherwise Chrome shows its print box. The Print button is always there, so a print is never lost.
'use strict';
(async () => {
  const q = new URLSearchParams(location.search), k = q.get('k'), raw = q.get('i'), i = /^\d+$/.test(raw) ? Number(raw) : -1;
  const all = /^kcPrintPdfs_[a-z]+_\d+$/.test(k) ? (await chrome.storage.session.get(k))[k] || [] : [];
  try {
    if (typeof all[i] !== 'string') throw new Error('gone');
    const bytes = Uint8Array.from(atob(all[i]), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const frame = document.getElementById('labels');
    frame.hidden = false; document.getElementById('note').hidden = true; frame.src = url;
    document.getElementById('again').onclick = () => { frame.contentWindow.focus(); frame.contentWindow.print(); };
    if (q.get('s') === '1') frame.onload = () => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { /* the Print button is there */ } };
  } catch (e) { document.getElementById('note').textContent = 'These labels are no longer here. Run the print again.'; }
})();
