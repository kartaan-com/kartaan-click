// Tells him when this tab belongs to an old Click: after Click loads a new build, a tab that was already open keeps
// the old script, cut off from Click. A small bar says "refresh this tab". Click never refreshes his tabs itself.
(() => {
  if (window.__kcStale) return;
  window.__kcStale = true;
  const t = setInterval(() => {
    if (chrome.runtime && chrome.runtime.id) return;
    clearInterval(t);
    const bar = document.createElement('div');
    bar.textContent = 'Click was updated -- refresh this tab.';
    bar.style.cssText = 'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:2147483647;background:#fff5db;color:#6b4a00;border:1px solid #f0dca6;border-radius:8px;padding:8px 14px;font:13px system-ui,sans-serif';
    document.documentElement.appendChild(bar);
  }, 5000);
})();
