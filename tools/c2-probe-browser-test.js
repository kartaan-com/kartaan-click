// Loads the C2-0 probe copy into a real, throwaway Chrome (own empty profile, no accounts) and drives it against a
// local stand-in for the Flipkart panel: seller.flipkart.com is pointed at 127.0.0.1 for THIS Chrome only.
// Needs: Chrome, openssl, node 22+.   Run: node tools/c2-probe-browser-test.js [blob|https|nopdf]
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), https = require('https');
const { spawn, execFileSync } = require('child_process');

const mode = process.argv[2] || 'blob';
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c2probe-'));
const ext = path.join(__dirname, '..', 'c2-probe');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n' + 'x'.repeat(3000));

execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=seller.flipkart.com', '-keyout', path.join(tmp, 'k.pem'), '-out', path.join(tmp, 'c.pem')], { stdio: 'ignore' });

const html = `<!doctype html><title>fake To Pack</title><table><tr><td>OD433882931204957100</td>
<td><button id="print">Print Labels</button></td></tr></table>
<script>
document.getElementById('print').onclick = async () => {
  if ('${mode}' === 'blob') {
    const bytes = await (await fetch('/label.pdf')).arrayBuffer();
    const u = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a'); a.href = u; a.download = 'label.pdf'; document.body.appendChild(a); a.click();
    setTimeout(() => URL.revokeObjectURL(u), 50);
  } else if ('${mode}' === 'nopdf') {
    const u = URL.createObjectURL(new Blob(['<html>nope'], { type: 'text/html' }));
    const a = document.createElement('a'); a.href = u; a.download = 'x.html'; document.body.appendChild(a); a.click();
  } else {
    const a = document.createElement('a'); a.href = 'https://seller.flipkart.com/label.pdf?sig=SECRET'; a.download = 'label.pdf'; document.body.appendChild(a); a.click();
  }
};
</script>`;
const server = https.createServer({ key: fs.readFileSync(path.join(tmp, 'k.pem')), cert: fs.readFileSync(path.join(tmp, 'c.pem')) }, (q, s) => {
  if (q.url.startsWith('/label.pdf')) { s.setHeader('content-type', 'application/pdf'); return s.end(PDF); }
  s.setHeader('content-type', 'text/html'); s.end(html);
}).listen(443, '127.0.0.1');

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function cdp(port) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(list.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const wait = {};
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && wait[m.id]) wait[m.id](m); };
  return { send: (method, params, sessionId) => new Promise(r => { const i = ++id; wait[i] = r; ws.send(JSON.stringify({ id: i, method, params, sessionId })); }), close: () => ws.close() };
}

(async () => {
  const dl = path.join(tmp, 'dl'); fs.mkdirSync(dl);
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', '--user-data-dir=' + path.join(tmp, 'profile'), '--enable-unsafe-extension-debugging', '--host-resolver-rules=MAP seller.flipkart.com 127.0.0.1', '--ignore-certificate-errors', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let result = 'NO RESULT';
  try {
    let c; for (let i = 0; i < 40; i++) { try { c = await cdp(9333); break; } catch (e) { await sleep(250); } }
    console.log('load ->', JSON.stringify((await c.send('Extensions.loadUnpacked', { path: ext })).result || 'none'));
    await c.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
    let sw; for (let i = 0; i < 40 && !sw; i++) { const sws = (await c.send('Target.getTargets')).result.targetInfos.filter(t => t.type === 'service_worker' && t.url.endsWith('/background.js')); for (const t of sws) { const ss = (await c.send('Target.attachToTarget', { targetId: t.targetId, flatten: true })).result.sessionId; const nm = await c.send('Runtime.evaluate', { expression: 'chrome.runtime.getManifest().name', returnByValue: true }, ss); if (nm.result && nm.result.result && /C2-0/.test(nm.result.result.value)) sw = t; } if (!sw) await sleep(250); }
    if (!sw) throw new Error('extension did not load (no service worker)');
    const swS = (await c.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true })).result.sessionId;
    const pg = (await c.send('Target.createTarget', { url: 'https://seller.flipkart.com/' })).result.targetId;
    const pgS = (await c.send('Target.attachToTarget', { targetId: pg, flatten: true })).result.sessionId;
    await sleep(1500);
    const ev = (s, expr) => c.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, s).then(r => { if (r.result && r.result.exceptionDetails) console.log('EXC', JSON.stringify(r.result.exceptionDetails).slice(0,400)); return r.result && (r.result.result ? r.result.result.value : r.result); });
    const tabId = await ev(swS, `chrome.tabs.query({url:'https://seller.flipkart.com/*'}).then(t=>t[0].id)`);
    console.log('arm ->', JSON.stringify(await ev(swS, `arm(${tabId})`)));
    await ev(pgS, `document.getElementById('print').click(); 1`);
    await sleep(3000);
    const lines = await ev(swS, `chrome.storage.local.get('c2probe').then(o=>o.c2probe.lines)`);
    console.log(lines.join('\n'));
    const saved = []; (function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) f.isDirectory() ? walk(path.join(d, f.name)) : saved.push(path.join(d, f.name)); })(dl);
    console.log('files saved:', saved.map(f => path.relative(dl, f) + ' (' + fs.statSync(f).size + ' bytes, starts ' + fs.readFileSync(f).subarray(0, 4).toString() + ')'));
    result = lines.some(l => /GOT A PDF, \d+ bytes, label for order OD433882931204957100/.test(l)) ? 'PROBE SAW THE PDF' : (lines.some(l => /normal address, not a blob/.test(l)) ? 'PROBE SAW A NORMAL ADDRESS (not fetched, by design)' : 'PROBE DID NOT SEE A PDF');
    c.close();
  } catch (e) { result = 'ERROR ' + e.message; }
  console.log('RESULT (' + mode + '): ' + result);
  chrome.kill(); server.close(); await sleep(500);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})();
