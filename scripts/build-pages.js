#!/usr/bin/env node
// scripts/build-pages.js — Static SEO page generator for dailyteetimes.com
//
// Reads the `courses` dict from index.html and emits:
//   /<state>/index.html                  — state hub page (course list)
//   /<state>/<course-slug>/index.html    — per-course landing page
//   /sitemap.xml                         — XML sitemap of every page
//
// Each course page is real HTML with:
//   - <title>, meta description, canonical, Open Graph
//   - H1 + breadcrumb + location + ratings (static, crawlable)
//   - JSON-LD GolfCourse schema for Google rich results
//   - Live tee-times widget that fetches /api/tee-times/<name> client-side
//     (Google indexes static content; live availability is UX-only)
//   - "Nearby courses" auto-linked (same state, prefer same city)
//   - Cloudflare Web Analytics beacon
//
// Run: `node scripts/build-pages.js`. No external deps.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const INDEX_HTML = path.join(ROOT, 'index.html');
const SITE_URL = 'https://dailyteetimes.com';
const API_BASE = 'https://tee-sheet-api-production.up.railway.app';
const CF_TOKEN = 'fa288814aa6d45e3afccb07ec44f9bf9';

const STATE_NAMES = {
  arizona: 'Arizona', utah: 'Utah', california: 'California',
  texas: 'Texas', nevada: 'Nevada', 'south-carolina': 'South Carolina',
  colorado: 'Colorado', florida: 'Florida', georgia: 'Georgia',
  illinois: 'Illinois', michigan: 'Michigan', 'new-jersey': 'New Jersey',
  'north-carolina': 'North Carolina', virginia: 'Virginia',
};
const STATE_CODES = {
  arizona: 'AZ', utah: 'UT', california: 'CA', texas: 'TX', nevada: 'NV',
  'south-carolina': 'SC', colorado: 'CO', florida: 'FL', georgia: 'GA',
  illinois: 'IL', michigan: 'MI', 'new-jersey': 'NJ', 'north-carolina': 'NC',
  virginia: 'VA',
};

// ── Extract courses dict from index.html ─────────────────────────────────
const html = fs.readFileSync(INDEX_HTML, 'utf8');
// Match `const courses = { ... };` — handle balanced braces by greedy match
// to the LAST `};` before `// ── HELPERS` or similar. We use a non-greedy
// regex from `const courses = {` to `\n};` which lands on the closing line.
const startIdx = html.indexOf('const courses = {');
if (startIdx === -1) {
  console.error('FATAL: Could not find "const courses = {" in index.html');
  process.exit(1);
}
// Walk forward counting brace depth
let depth = 0, endIdx = -1;
for (let i = startIdx + 'const courses = '.length; i < html.length; i++) {
  const ch = html[i];
  if (ch === '{') depth++;
  else if (ch === '}') {
    depth--;
    if (depth === 0) { endIdx = i + 1; break; }
  }
}
if (endIdx === -1) {
  console.error('FATAL: Unbalanced braces in courses dict');
  process.exit(1);
}
const coursesObjLiteral = html.slice(startIdx + 'const courses = '.length, endIdx);
const courses = vm.runInNewContext('(' + coursesObjLiteral + ')');

console.log(`Extracted courses dict: ${Object.keys(courses).length} states, ${Object.values(courses).flat().length} courses total`);

// ── Helpers ──────────────────────────────────────────────────────────────
function slugify(s) {
  return s.toLowerCase()
    .replace(/['`’]/g, '')
    .replace(/[—–]/g, '-')
    .replace(/&/g, 'and')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function htmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function jsonStringEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

function pickNearby(course, state, n = 5) {
  const all = courses[state] || [];
  const sameCity = all.filter(c => c.city === course.city && c.name !== course.name);
  const otherCity = all.filter(c => c.city !== course.city && c.name !== course.name);
  // Deterministic shuffle for stable build output (seeded by course name length)
  const seed = course.name.length;
  const shuffled = otherCity.map(c => ({ c, k: (c.name.charCodeAt(0) * seed) % 997 })).sort((a, b) => a.k - b.k).map(x => x.c);
  return [...sameCity, ...shuffled].slice(0, n);
}

// ── Shared CSS (kept in sync across all generated pages) ─────────────────
const PAGE_CSS = `
:root{--green-deep:#2e5031;--green-accent:#4a7c50;--green-light:#7eb085;--white:#fff;--bg:#f7faf7;--text:#1a2a1c;--muted:#5e6b60;--border:#d8e1da;--card:#fff}
*{box-sizing:border-box;margin:0;padding:0}
html,body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--text);line-height:1.5;-webkit-font-smoothing:antialiased}
a{color:var(--green-accent);text-decoration:none}
a:hover{text-decoration:underline}
.header{background:var(--green-deep);padding:18px 32px;display:flex;align-items:center;justify-content:space-between}
.logo{color:var(--white);font-size:20px;font-weight:700;text-decoration:none;letter-spacing:-0.3px}
.logo:hover{text-decoration:none}
.header nav a{color:rgba(255,255,255,0.82);margin-left:18px;font-size:14px}
.header nav a:hover{color:var(--white);text-decoration:none}
.crumb{padding:14px 32px;font-size:13px;color:var(--muted);background:var(--white);border-bottom:1px solid var(--border)}
.crumb a{color:var(--green-accent)}
.main{max-width:880px;margin:0 auto;padding:32px;}
.main h1{font-size:clamp(26px,4vw,36px);line-height:1.15;margin-bottom:6px;letter-spacing:-0.5px}
.location{color:var(--muted);font-size:15px;margin-bottom:6px}
.rating{color:var(--green-accent);font-size:14px;margin-bottom:24px;font-weight:600}
.intro p{margin:0 0 14px;color:var(--text);font-size:16px}
.tee-times-section{margin:28px 0;padding:24px;background:var(--card);border:1px solid var(--border);border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,0.03)}
.tee-times-section h2{font-size:20px;margin-bottom:14px;font-weight:700}
.tee-times-meta{font-size:13px;color:var(--muted);margin-bottom:14px}
.tee-times-grid{display:flex;flex-wrap:wrap;gap:8px}
.tee-time-btn{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 14px;background:var(--green-accent);color:var(--white)!important;border-radius:8px;font-size:11px;min-width:88px;transition:background 0.15s}
.tee-time-btn:hover{background:var(--green-deep);text-decoration:none}
.tee-time-btn .t-time{font-weight:700;font-size:14px}
.tee-time-btn .t-price{font-weight:600;font-size:13px}
.loading,.no-times{color:var(--muted);font-size:14px;padding:12px 0}
.nearby h2{font-size:18px;margin:32px 0 12px;font-weight:700}
.nearby-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.nearby-card{padding:14px 16px;background:var(--card);border:1px solid var(--border);border-radius:10px;transition:border-color 0.15s}
.nearby-card:hover{border-color:var(--green-accent)}
.nearby-card a{display:block;color:var(--text)}
.nearby-card .nm{font-weight:600;font-size:14px;margin-bottom:2px}
.nearby-card .ct{color:var(--muted);font-size:12px}
.state-courses{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:24px}
.state-course{padding:16px 18px;background:var(--card);border:1px solid var(--border);border-radius:10px;transition:border-color 0.15s}
.state-course:hover{border-color:var(--green-accent)}
.state-course a{display:block;color:var(--text)}
.state-course .nm{font-weight:600;font-size:15px;margin-bottom:4px}
.state-course .ct{color:var(--muted);font-size:13px}
.city-header{font-size:14px;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);margin:28px 0 8px;font-weight:700}
footer{background:var(--green-deep);padding:28px 24px;text-align:center;color:rgba(255,255,255,0.55);font-size:12px;margin-top:48px}
footer a{color:rgba(255,255,255,0.82)}
.footer-title{font-size:15px;font-weight:700;color:var(--white);margin-bottom:6px}
@media(max-width:600px){.main{padding:20px 18px}.header,.crumb{padding-left:18px;padding-right:18px}}
`;

const CF_BEACON = `<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "${CF_TOKEN}"}'></script>`;

// ── Course page template ─────────────────────────────────────────────────
function renderCoursePage(course, state) {
  const stateName = STATE_NAMES[state];
  const stateCode = STATE_CODES[state];
  const slug = slugify(course.name);
  const courseUrl = `${SITE_URL}/${state}/${slug}/`;
  const nearby = pickNearby(course, state, 5);

  // Description paragraphs — varied by tier + rating signal so pages aren't templated-looking
  const ratingTier = course.rating
    ? (course.rating >= 4.6 ? 'one of the highest-rated' : course.rating >= 4.3 ? 'a top-rated' : course.rating >= 4.0 ? 'a well-regarded' : 'a popular')
    : 'a popular';
  const intro1 = `${course.name} is ${ratingTier} public golf course in ${course.city}, ${stateName}.`;
  const intro2 = course.rating
    ? `With a ${course.rating}/5 rating from ${(course.reviews || 0).toLocaleString()} golfer reviews, it's earned a strong reputation among players in the ${course.city} area and across ${stateName}.`
    : `${course.city} is one of ${stateName}'s notable golf destinations, and ${course.name} is a regular pick for locals and travelers alike.`;
  const intro3 = `Daily Tee Times aggregates real-time availability so you can see today's open tee times and pricing at ${course.name} at a glance. Click any time slot below to book directly with the course — no fees, no signup required.`;

  // JSON-LD schema
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'GolfCourse',
    name: course.name,
    address: {
      '@type': 'PostalAddress',
      addressLocality: course.city,
      addressRegion: stateCode,
      addressCountry: 'US',
    },
    url: courseUrl,
  };
  if (course.rating) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: course.rating,
      reviewCount: course.reviews || 1,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${htmlEscape(course.name)} Tee Times — ${htmlEscape(course.city)}, ${stateCode} | Daily Tee Times</title>
<meta name="description" content="Live tee times and prices at ${htmlEscape(course.name)} in ${htmlEscape(course.city)}, ${stateName}. Real-time availability, no fees, no signup. Book directly with the course.">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${courseUrl}">

<meta property="og:type" content="website">
<meta property="og:url" content="${courseUrl}">
<meta property="og:title" content="${htmlEscape(course.name)} Tee Times — ${htmlEscape(course.city)}, ${stateCode}">
<meta property="og:description" content="Live tee times at ${htmlEscape(course.name)} in ${htmlEscape(course.city)}, ${stateName}. Real-time pricing and availability.">
<meta property="og:site_name" content="Daily Tee Times">
<meta property="og:locale" content="en_US">

<script type="application/ld+json">${JSON.stringify(schema)}</script>

<style>${PAGE_CSS}</style>
</head>
<body>

<header class="header">
  <a class="logo" href="/">Daily Tee Times</a>
  <nav><a href="/${state}/">${stateName}</a><a href="/">All States</a></nav>
</header>

<nav class="crumb"><a href="/">Home</a> &rsaquo; <a href="/${state}/">${stateName}</a> &rsaquo; ${htmlEscape(course.name)}</nav>

<main class="main">
  <h1>${htmlEscape(course.name)}</h1>
  <div class="location">${htmlEscape(course.city)}, ${stateName}</div>
  ${course.rating ? `<div class="rating">★ ${course.rating} · ${(course.reviews || 0).toLocaleString()} reviews</div>` : ''}

  <section class="intro">
    <p>${intro1}</p>
    <p>${intro2}</p>
    <p>${intro3}</p>
  </section>

  <section class="tee-times-section">
    <h2>Today's Tee Times at ${htmlEscape(course.name)}</h2>
    <div class="tee-times-meta" id="teeDate"></div>
    <div class="tee-times-grid" id="teeTimesGrid"><span class="loading">⏳ Loading live availability...</span></div>
  </section>

  ${nearby.length ? `<section class="nearby">
    <h2>More Courses Near ${htmlEscape(course.city)}, ${stateName}</h2>
    <div class="nearby-grid">${nearby.map(n => `<div class="nearby-card"><a href="/${state}/${slugify(n.name)}/"><div class="nm">${htmlEscape(n.name)}</div><div class="ct">${htmlEscape(n.city)}, ${stateCode}</div></a></div>`).join('')}</div>
  </section>` : ''}
</main>

<footer>
  <div class="footer-title">Daily Tee Times</div>
  <div>Find and book tee times at 340+ golf courses nationally.</div>
  <div style="margin-top:8px"><a href="/">Home</a> &middot; <a href="/${state}/">${stateName} courses</a></div>
  <div style="margin-top:8px;opacity:0.7">© 2026 Daily Tee Times. All rights reserved.</div>
</footer>

<script>
(async () => {
  var courseName = ${JSON.stringify(course.name)};
  var apiBase = ${JSON.stringify(API_BASE)};
  var date = new Date().toISOString().split('T')[0];
  document.getElementById('teeDate').textContent = 'Showing live availability for ' + new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  var grid = document.getElementById('teeTimesGrid');
  try {
    var r = await fetch(apiBase + '/api/tee-times/' + encodeURIComponent(courseName) + '?date=' + date + '&players=2');
    if (!r.ok) throw new Error('http ' + r.status);
    var data = await r.json();
    var times = (data.teeTimes || []).filter(function(t) { return t.time; });
    if (times.length === 0) {
      grid.innerHTML = '<span class="no-times">No tee times available for today. <a href="/">Try a different date on the homepage</a></span>';
      return;
    }
    grid.innerHTML = times.map(function(t) {
      var time = t.time;
      var rawPrice = t.priceStr || t.price;
      var price = rawPrice && String(rawPrice).startsWith('$') ? rawPrice : ('$' + (rawPrice || '—'));
      var players = t.players || t.spots || t.maxPlayers || 4;
      var url = t.bookingUrl || '/';
      return '<a href="' + url + '" target="_blank" rel="noopener" class="tee-time-btn">'
           + '<span class="t-time">' + time + '</span>'
           + '<span class="t-price">' + price + '</span>'
           + '<span style="opacity:0.85">' + players + ' avail</span></a>';
    }).join('');
  } catch (e) {
    grid.innerHTML = '<span class="no-times">Couldn\\'t load live tee times right now. <a href="/">View live availability on the homepage</a></span>';
  }
})();
</script>

${CF_BEACON}
</body>
</html>`;
}

// ── State hub page template ──────────────────────────────────────────────
function renderStatePage(state) {
  const stateName = STATE_NAMES[state];
  const stateCode = STATE_CODES[state];
  const stateUrl = `${SITE_URL}/${state}/`;
  const list = (courses[state] || []).slice().sort((a, b) => a.name.localeCompare(b.name));

  // Group by city
  const byCity = {};
  for (const c of list) {
    if (!byCity[c.city]) byCity[c.city] = [];
    byCity[c.city].push(c);
  }
  const citiesSorted = Object.keys(byCity).sort();
  const totalCount = list.length;

  // SEO copy
  const cityList = citiesSorted.slice(0, 12).join(', ');
  const description = `Live tee times and prices at ${totalCount} ${stateName} golf courses across ${citiesSorted.length} cities including ${cityList}. Real-time availability, no fees, no signup.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${stateName} Golf Tee Times — ${totalCount} Courses | Daily Tee Times</title>
<meta name="description" content="${htmlEscape(description)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${stateUrl}">

<meta property="og:type" content="website">
<meta property="og:url" content="${stateUrl}">
<meta property="og:title" content="${stateName} Golf Tee Times — ${totalCount} Courses">
<meta property="og:description" content="Live tee times at ${totalCount} ${stateName} golf courses. Real-time availability, no fees, no signup.">
<meta property="og:site_name" content="Daily Tee Times">

<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL + '/' },
    { '@type': 'ListItem', position: 2, name: stateName, item: stateUrl },
  ],
})}</script>

<style>${PAGE_CSS}</style>
</head>
<body>

<header class="header">
  <a class="logo" href="/">Daily Tee Times</a>
  <nav><a href="/">All States</a></nav>
</header>

<nav class="crumb"><a href="/">Home</a> &rsaquo; ${stateName}</nav>

<main class="main">
  <h1>${stateName} Golf Tee Times</h1>
  <div class="location">${totalCount} courses across ${citiesSorted.length} ${citiesSorted.length === 1 ? 'city' : 'cities'}</div>

  <section class="intro" style="margin-top:24px">
    <p>Daily Tee Times aggregates live availability and pricing at <strong>${totalCount} ${stateName} golf courses</strong>. From ${citiesSorted[0]} to ${citiesSorted[citiesSorted.length-1]}, you can compare today's tee times across the state in one place. Real-time data, refreshed every 10 minutes, no fees, no signup required.</p>
    <p>Click any course below to see its current availability, pricing, and book directly. Or use the homepage to filter all ${totalCount} ${stateName} courses by date, players, and time of day.</p>
  </section>

  ${citiesSorted.map(city => `
    <h2 class="city-header">${htmlEscape(city)} (${byCity[city].length})</h2>
    <div class="state-courses">
      ${byCity[city].map(c => `<div class="state-course"><a href="/${state}/${slugify(c.name)}/"><div class="nm">${htmlEscape(c.name)}</div><div class="ct">${course_subtitle(c)}</div></a></div>`).join('')}
    </div>
  `).join('')}
</main>

<footer>
  <div class="footer-title">Daily Tee Times</div>
  <div>Find and book tee times at 340+ golf courses nationally.</div>
  <div style="margin-top:8px"><a href="/">Home</a></div>
  <div style="margin-top:8px;opacity:0.7">© 2026 Daily Tee Times. All rights reserved.</div>
</footer>

${CF_BEACON}
</body>
</html>`;
}

function course_subtitle(c) {
  const bits = [];
  if (c.rating) bits.push(`★ ${c.rating}`);
  if (c.reviews) bits.push(`${(c.reviews).toLocaleString()} reviews`);
  return htmlEscape(bits.join(' · ') || 'View tee times');
}

// ── Sitemap.xml ──────────────────────────────────────────────────────────
function renderSitemap(allUrls) {
  const today = new Date().toISOString().split('T')[0];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq || 'daily'}</changefreq>
    <priority>${u.priority || '0.7'}</priority>
  </url>`).join('\n')}
</urlset>
`;
}

// ── Main: generate everything ────────────────────────────────────────────
const sitemapUrls = [
  { loc: SITE_URL + '/', changefreq: 'hourly', priority: '1.0' },
];

let stateCount = 0, courseCount = 0;
for (const state of Object.keys(courses)) {
  if (!STATE_NAMES[state]) {
    console.warn(`  skipping unknown state key: ${state}`);
    continue;
  }
  const stateDir = path.join(ROOT, state);
  fs.mkdirSync(stateDir, { recursive: true });

  fs.writeFileSync(path.join(stateDir, 'index.html'), renderStatePage(state));
  stateCount++;
  sitemapUrls.push({
    loc: `${SITE_URL}/${state}/`,
    changefreq: 'daily',
    priority: '0.8',
  });

  for (const course of courses[state]) {
    const slug = slugify(course.name);
    const courseDir = path.join(stateDir, slug);
    fs.mkdirSync(courseDir, { recursive: true });
    fs.writeFileSync(path.join(courseDir, 'index.html'), renderCoursePage(course, state));
    courseCount++;
    sitemapUrls.push({
      loc: `${SITE_URL}/${state}/${slug}/`,
      changefreq: 'daily',
      priority: '0.7',
    });
  }
  console.log(`  ${state}: ${courses[state].length} course pages + 1 state hub`);
}

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), renderSitemap(sitemapUrls));

console.log(`\n✓ Generated:`);
console.log(`  ${stateCount} state hub pages`);
console.log(`  ${courseCount} course pages`);
console.log(`  1 sitemap.xml with ${sitemapUrls.length} URLs`);
