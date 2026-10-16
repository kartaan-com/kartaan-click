// Reads the product page the user is looking at and turns it into one plain-text block.
//
// Injected by the popup only when the user presses "Copy product details" (activeTab),
// so it never runs on its own and never touches any other page. It reads only what
// the page already shows in the user's own browser. It does not fetch anything, does
// not click anything, and if the page is a robot check or sign-in wall it says so
// and stops — it never tries to get past one.
//
// The value of the LAST expression is what executeScript hands back to the popup.

(() => {
  'use strict';

  const host = location.hostname.toLowerCase();
  const platform = /(^|\.)amazon\.in$/.test(host) ? 'Amazon'
    : /(^|\.)meesho\.com$/.test(host) ? 'Meesho'
    : /(^|\.)flipkart\.com$/.test(host) ? 'Flipkart' : '';
  if (!platform) return { ok: false, reason: 'wrong-site' };

  const clean = s => String(s == null ? '' : s).replace(/[‎‏]/g, '').replace(/\s+/g, ' ').trim();
  const cap = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const txt = el => (el ? clean(el.textContent) : '');
  const first = (...sels) => {
    for (const s of sels) { const t = txt(document.querySelector(s)); if (t) return t; }
    return '';
  };

  // A robot check or sign-in wall is not a product. Say so; do not work around it.
  const title0 = clean(document.title).toLowerCase();
  if (document.querySelector('form[action*="validateCaptcha"]') || /robot check|captcha|access denied|are you a human/.test(title0)) {
    return { ok: false, reason: 'blocked' };
  }

  // ── structured data most shops embed for search engines ──
  let ld = null;
  const walk = (node) => {
    if (!node || ld) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node !== 'object') return;
    const t = node['@type'];
    if (t === 'Product' || (Array.isArray(t) && t.includes('Product'))) { ld = node; return; }
    if (node['@graph']) walk(node['@graph']);
  };
  document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
    try { walk(JSON.parse(s.textContent)); } catch (e) { /* not ours to fix */ }
  });
  const offer = ld && (Array.isArray(ld.offers) ? ld.offers[0] : ld.offers) || {};
  const meta = n => { const m = document.querySelector(`meta[property="${n}"],meta[name="${n}"]`); return m ? clean(m.content) : ''; };

  const f = {};          // single-value fields
  const bullets = [];
  const specs = [];
  const images = [];

  // ── per-site reading, falling back to the structured data ──
  if (platform === 'Amazon') {
    f.title = first('#productTitle');
    f.brand = first('#bylineInfo').replace(/^(Visit the |Brand:\s*)/i, '').replace(/\s*Store$/i, '');
    f.price = first('#corePrice_feature_div .priceToPay .a-offscreen', '#corePrice_feature_div .a-price .a-offscreen', '.priceToPay .a-offscreen');
    f.mrp = first('#corePrice_feature_div .basisPrice .a-offscreen', '#corePrice_feature_div .a-text-price .a-offscreen', '.basisPrice .a-offscreen');
    f.discount = first('#corePrice_feature_div .savingsPercentage');
    f.rating = first('#acrPopover .a-icon-alt', '#averageCustomerReviews .a-icon-alt');
    f.rating_count = first('#acrCustomerReviewText', '#averageCustomerReviews_feature_div #acrCustomerReviewText');
    f.seller = first('#sellerProfileTriggerId', '#merchantInfoFeature_feature_div .offer-display-feature-text-message', '#tabular-buybox .tabular-buybox-text[tabular-attribute-name="Sold by"]');
    f.category = [...document.querySelectorAll('#wayfinding-breadcrumbs_feature_div li a')].map(txt).filter(Boolean).join(' > ');
    f.description = first('#productDescription', '#aplus_feature_div');
    document.querySelectorAll('#feature-bullets li span.a-list-item').forEach(e => { const t = txt(e); if (t) bullets.push(t); });
    document.querySelectorAll('#productOverview_feature_div tr, #productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr, #prodDetails table tr').forEach(r => {
      const k = txt(r.querySelector('th, td:first-child')), v = txt(r.querySelector('td:last-child'));
      if (k && v && k !== v) specs.push(k + ' | ' + v.replace(/\s*Report an incorrect code/i, ''));
    });
    document.querySelectorAll('#detailBullets_feature_div li').forEach(li => {
      const t = txt(li).replace(/\s*:\s*/, ' | ').replace(/\s*[‏‎]+\s*/g, ' ');
      if (t.includes('|')) specs.push(t.replace(/\s*Report an incorrect code/i, ''));
    });
    const hi = document.querySelector('#landingImage, #imgBlkFront');
    if (hi) { const big = hi.getAttribute('data-old-hires') || hi.src; if (big) images.push(big); }
    document.querySelectorAll('#altImages img').forEach(i => {
      const u = (i.src || '').replace(/\._[A-Z0-9_,]+_\./, '.');
      if (u && !/sprite|play-button|transparent-pixel/.test(u)) images.push(u);
    });
    const asin = (location.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i) || [])[1];
    f.link = asin ? 'https://www.amazon.in/dp/' + asin : '';
    if (asin) f.asin = asin;
  } else {
    // Meesho and Flipkart rename their page styles often, so lean on the structured
    // data and on the section headings the page itself shows.
    f.title = first('h1');
    f.category = [...document.querySelectorAll('[class*="readcrumb"] a')].map(txt).filter(t => t && t.length < 40).slice(0, 8).join(' > ');
    const section = (re) => {
      for (const el of document.querySelectorAll('h1,h2,h3,h4,div,span,p')) {
        if (el.children.length > 1) continue;
        const own = clean(el.textContent);
        if (own.length < 40 && re.test(own)) {
          let box = el.nextElementSibling || (el.parentElement && el.parentElement.nextElementSibling);
          if (box) { const t = txt(box); if (t) return t; }
        }
      }
      return '';
    };
    f.description = section(/^(product )?description$/i) || section(/^product details$/i);
    const sp = section(/^specifications?$/i);
    f.specifications_text = sp;
    f.highlights_text = section(/^highlights$/i);
    const sold = [...document.querySelectorAll('div,span,a')].find(e => e.children.length < 2 && /^(sold by|seller)\b/i.test(clean(e.textContent)) && clean(e.textContent).length < 80);
    f.seller = sold ? clean(sold.textContent).replace(/^(sold by|seller)\s*:?\s*/i, '') : '';
    f.link = '';
  }

  // structured data / page meta fill anything still empty
  if (ld) {
    f.title = f.title || clean(ld.name);
    f.brand = f.brand || clean(ld.brand && (ld.brand.name || ld.brand));
    f.price = f.price || (offer.price ? clean((offer.priceCurrency === 'INR' ? '₹' : (offer.priceCurrency || '') + ' ') + offer.price) : '');
    f.description = f.description || clean(ld.description);
    f.sku = clean(ld.sku || ld.productID || '');
    const ar = ld.aggregateRating;
    if (ar) {
      f.rating = f.rating || clean(ar.ratingValue);
      f.rating_count = f.rating_count || clean(ar.ratingCount || ar.reviewCount);
    }
    const im = Array.isArray(ld.image) ? ld.image : (ld.image ? [ld.image] : []);
    im.forEach(u => images.push(typeof u === 'string' ? u : (u && u.url) || ''));
  }
  f.title = f.title || meta('og:title');
  f.description = f.description || meta('og:description') || meta('description');
  if (!images.length && meta('og:image')) images.push(meta('og:image'));
  const canon = document.querySelector('link[rel="canonical"]');
  f.link = f.link || (canon && canon.href) || location.href.split('#')[0];

  // No title means no product on this page (home page, search results, error page…).
  if (!f.title) return { ok: false, reason: 'no-product' };

  const uniq = a => [...new Set(a.filter(Boolean))];
  const lines = [
    '=== KARTAAN CLICK PRODUCT DETAILS v1 ===',
    'platform: ' + platform,
    'page_link: ' + f.link,
    'title: ' + cap(f.title, 400),
  ];
  const one = (k, v, n) => { v = clean(v); if (v) lines.push(k + ': ' + cap(v, n || 300)); };
  one('brand', f.brand);
  one('asin', f.asin);
  one('sku', f.sku);
  one('price', f.price);
  one('mrp', f.mrp);
  one('discount', f.discount);
  one('rating', f.rating);
  one('rating_count', f.rating_count);
  one('seller', f.seller);
  one('category', f.category, 400);
  one('description', f.description, 3000);
  uniq(bullets).slice(0, 15).forEach(b => one('bullet', b, 500));
  uniq(specs).slice(0, 60).forEach(s => one('spec', s, 300));
  one('specifications_text', f.specifications_text, 2500);
  one('highlights_text', f.highlights_text, 1500);
  uniq(images).slice(0, 10).forEach(u => one('image', u, 500));
  lines.push('=== END ===');
  return { ok: true, text: lines.join('\n'), title: f.title };
})();
