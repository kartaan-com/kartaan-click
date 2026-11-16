// Checks for the C2-0 probe watcher (c2-probe/probe-lib.js). Run: node tools/test-c2-probe.js
'use strict';
const assert = require('assert');
const vm = require('vm');
const lib = require('../c2-probe/probe-lib.js');

let n = 0;
const ok = (name, fn) => Promise.resolve().then(fn).then(() => { n++; console.log('ok  ' + name); }, (e) => { console.error('FAIL ' + name); throw e; });
const tick = () => new Promise(r => setTimeout(r, 20));

// A stand-in page: URL.createObjectURL, window.postMessage/open, anchor click, Date.
function page() {
  const posted = [];
  const calls = { create: 0, open: 0, click: 0 };
  const win = {
    location: { origin: 'https://seller.flipkart.com' },
    postMessage: (d, o) => posted.push({ d, o }),
    open: function () { calls.open++; return 'opened'; },
  };
  const URLs = { createObjectURL: function (b) { calls.create++; return 'blob:https://seller.flipkart.com/abc'; } };
  class A { click() { calls.click++; } }
  const ctx = vm.createContext({ window: win, URL: URLs, HTMLAnchorElement: A, Date, Uint8Array, String, btoa, setTimeout, Promise, Number });
  return { win, URLs, A, ctx, posted, calls };
}
const pdfBlob = (extra) => new Blob([Buffer.from('%PDF-1.4 ' + (extra || 'x'.repeat(200)))], { type: 'application/pdf' });
const run = (p, ttl, cap) => vm.runInContext('(' + lib.kcProbeWatcher.toString() + ')("TOK", ' + (cap || 1e6) + ', ' + (ttl || 60000) + ')', p.ctx);

(async () => {
  await ok('checkPdf: %PDF in size is true; wrong header, empty, over cap are false', () => {
    assert(lib.checkPdf(Buffer.from('%PDF-1.7 abc')));
    assert(!lib.checkPdf(Buffer.from('<html>not a pdf')));
    assert(!lib.checkPdf(Buffer.from('')));
    assert(!lib.checkPdf(Buffer.from('%PDF-1.7 abc'), 5));
    assert(!lib.checkPdf(null));
  });
  await ok('findOrderId finds OD + digits only', () => {
    assert.strictEqual(lib.findOrderId('Order OD433882931204957100 shipping'), 'OD433882931204957100');
    assert.strictEqual(lib.findOrderId('Order ID 12345'), null);
    assert.strictEqual(lib.findOrderId('xOD433882931204957100'), null);
  });
  await ok('safeAddress drops the query', () => assert.strictEqual(lib.safeAddress('https://a.flipkart.com/p/l.pdf?sig=SECRET#x'), 'https://a.flipkart.com/p/l.pdf'));

  await ok('watcher: page still gets its own blob address back', async () => {
    const p = page(); run(p);
    assert.strictEqual(p.URLs.createObjectURL(pdfBlob()), 'blob:https://seller.flipkart.com/abc');
    assert.strictEqual(p.calls.create, 1);
  });
  await ok('watcher: a PDF blob is posted ONCE with token, base64 equal to the bytes', async () => {
    const p = page(); run(p);
    const b = pdfBlob('hello');
    p.URLs.createObjectURL(b); p.URLs.createObjectURL(pdfBlob('second'));
    await tick(); await tick();
    const pdfs = p.posted.filter(x => x.d.kind === 'pdf');
    assert.strictEqual(pdfs.length, 1);
    assert.strictEqual(pdfs[0].d.kcProbe, 'TOK');
    assert.strictEqual(pdfs[0].o, 'https://seller.flipkart.com');
    assert.strictEqual(Buffer.from(pdfs[0].d.b64, 'base64').toString(), '%PDF-1.4 hello');
  });
  await ok('watcher: a non-PDF blob is reported as seen, no bytes sent', async () => {
    const p = page(); run(p);
    p.URLs.createObjectURL(new Blob(['<html>'], { type: 'text/html' }));
    await tick();
    assert.strictEqual(p.posted.length, 1);
    assert.strictEqual(p.posted[0].d.kind, 'seen');
    assert.strictEqual(p.posted[0].d.pdf, false);
    assert(!('b64' in p.posted[0].d));
  });
  await ok('watcher: a PDF over the size cap is not read, only reported', async () => {
    const p = page(); run(p, 60000, 50);
    p.URLs.createObjectURL(pdfBlob('y'.repeat(500)));
    await tick();
    assert.strictEqual(p.posted[0].d.kind, 'seen');
    assert.strictEqual(p.posted[0].d.tooBig, true);
    assert(!('b64' in p.posted[0].d));
  });
  await ok('watcher: after its time is up it posts nothing and still passes through', async () => {
    const p = page(); run(p, -1);
    assert.strictEqual(p.URLs.createObjectURL(pdfBlob()), 'blob:https://seller.flipkart.com/abc');
    await tick();
    assert.strictEqual(p.posted.length, 0);
  });
  await ok('watcher: bad input to createObjectURL does not break the page', async () => {
    const p = page(); run(p);
    assert.strictEqual(p.URLs.createObjectURL(null), 'blob:https://seller.flipkart.com/abc');
    assert.strictEqual(p.URLs.createObjectURL({}), 'blob:https://seller.flipkart.com/abc');
    await tick(); assert.strictEqual(p.posted.length, 0);
  });
  await ok('watcher: an https label address via window.open / anchor click is reported, and the page action still happens', async () => {
    const p = page(); run(p);
    assert.strictEqual(p.win.open('https://seller.flipkart.com/labels/x.pdf'), 'opened');
    assert.strictEqual(p.calls.open, 1);
    assert.strictEqual(p.posted.find(x => x.d.kind === 'url').d.url, 'https://seller.flipkart.com/labels/x.pdf');
    const a = new p.A(); a.href = 'https://seller.flipkart.com/label/1'; a.click();
    assert.strictEqual(p.calls.click, 1);
    assert.strictEqual(p.posted.filter(x => x.d.kind === 'url').length, 2);
  });
  await ok('watcher: an unrelated address is not reported', async () => {
    const p = page(); run(p);
    p.win.open('https://seller.flipkart.com/orders/list');
    assert.strictEqual(p.posted.length, 0);
  });

  // The relay: only the right token, same window, once.
  function relay(ttl) {
    const sent = [], listeners = {};
    const win = { addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener: (t) => { delete listeners[t]; } };
    const doc = { addEventListener: (t, f) => { listeners['doc' + t] = f; }, removeEventListener: (t) => { delete listeners['doc' + t]; } };
    const chrome = { runtime: { sendMessage: (m) => sent.push(m) } };
    const ctx = vm.createContext({ window: win, document: doc, chrome, String, Number, Object, Date });
    vm.runInContext('(' + lib.kcProbeRelay.toString() + ')("TOK", ' + (ttl === undefined ? 60000 : ttl) + ')', ctx);
    // a removed listener is never called, like the browser
    return { sent, listeners, msg: (d, src) => { if (listeners.message) listeners.message({ data: d, source: src === undefined ? win : src }); }, win };
  }
  await ok('relay: wrong token, wrong source, or a non-object are all ignored', () => {
    const r = relay();
    r.msg({ kcProbe: 'NOPE', kind: 'pdf', b64: 'AA' });
    r.msg({ kcProbe: 'TOK', kind: 'pdf', b64: 'AA' }, {});
    r.msg('TOK'); r.msg(null);
    assert.strictEqual(r.sent.length, 0);
  });
  await ok('relay: the right token passes a PDF once; a second one is refused', () => {
    const r = relay();
    r.msg({ kcProbe: 'TOK', kind: 'pdf', b64: 'JVBERg==', size: 5, type: 'application/pdf' });
    r.msg({ kcProbe: 'TOK', kind: 'pdf', b64: 'JVBERg==', size: 5 });
    assert.strictEqual(r.sent.length, 1);
    assert.strictEqual(r.sent[0].kind, 'pdf');
  });
  await ok('relay: a forged message after the PDF is spent is refused, unknown kinds too', () => {
    const r = relay();
    r.msg({ kcProbe: 'TOK', kind: 'weird' });
    r.msg({ kcProbe: 'TOK', kind: 'pdf', size: 5 });          // no bytes: refused
    assert.strictEqual(r.sent.length, 0);
  });
  await ok('relay: after the PDF is passed both of its listeners are removed', () => {
    const r = relay();
    r.msg({ kcProbe: 'TOK', kind: 'pdf', b64: 'JVBERg==', size: 5 });
    assert(!r.listeners.message && !r.listeners.docclick);
  });
  await ok('relay: past its time it sends nothing and removes its listeners', () => {
    const r = relay(-1);
    r.msg({ kcProbe: 'TOK', kind: 'pdf', b64: 'JVBERg==', size: 5 });
    assert.strictEqual(r.sent.length, 0);
    assert(!r.listeners.message && !r.listeners.docclick);
  });
  await ok('watcher: after the PDF the page own createObjectURL / open / click are put back', async () => {
    const p = page(); const o = [p.URLs.createObjectURL, p.win.open, p.A.prototype.click]; run(p);
    assert.notStrictEqual(p.URLs.createObjectURL, o[0]);
    p.URLs.createObjectURL(pdfBlob()); await tick(); await tick();
    assert.deepStrictEqual([p.URLs.createObjectURL, p.win.open, p.A.prototype.click], o);
  });

  console.log('\n' + n + ' checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
