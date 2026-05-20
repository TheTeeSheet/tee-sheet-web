#!/usr/bin/env node
// scripts/build-pages.js — Static SEO page generator for dailyteetimes.com (v2)
//
// Reads the `courses` dict from index.html and emits:
//   /<state>/index.html                       — state hub
//   /<state>/<city-slug>/index.html           — city sub-page (NEW v2)
//   /<state>/<course-slug>/index.html         — per-course landing
//   /sitemap.xml                              — XML sitemap
//
// v2 additions per course page:
//   - FAQ section with FAQPage schema (long-tail rich-result eligible)
//   - "How to book" actionable section
//   - "About <city>" mini-context with state region awareness
//   - Sister courses (same-city) + nearby courses (same-state)
//   - Variation in opening sentence + tier language so pages aren't templated
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

// City → region/area context. Curated for the bigger golf metros — courses
// in cities not listed fall back to a generic blurb.
const CITY_REGION = {
  // NC
  'Pinehurst': 'Sandhills — long considered the cradle of American golf',
  'Southern Pines': 'Sandhills, just minutes from the Pinehurst golf hub',
  'Aberdeen': 'Sandhills region near Pinehurst',
  'Cary': 'Research Triangle area near Raleigh',
  'Chapel Hill': 'Research Triangle, home of UNC',
  'Nags Head': 'Outer Banks coast',
  'Powells Point': 'northern Outer Banks',
  'Black Mountain': 'Asheville area mountains',
  'Etowah': 'mountains south of Asheville',
  'Leland': 'Wilmington-Brunswick coast',
  'Calabash': 'NC-SC border coast, part of the Myrtle Beach golf trail',
  'Sanford': 'Sandhills foothills',
  'Greensboro': 'Triad region',
  'Asheboro': 'Triad-Sandhills border',
  // SC
  'Myrtle Beach': 'Grand Strand — the heart of US golf-trip destinations',
  'North Myrtle Beach': 'Grand Strand',
  'Pawleys Island': 'south Grand Strand, home of classic seaside layouts',
  'Murrells Inlet': 'south Grand Strand',
  'Conway': 'inland from Myrtle Beach',
  'Longs': 'north Grand Strand',
  'Mount Pleasant': 'Charleston harbor area',
  'Bluffton': 'Hilton Head area',
  'Columbia': "SC's Midlands capital",
  // VA
  'Virginia Beach': 'Hampton Roads coast',
  'Chesapeake': 'Hampton Roads metro',
  'Suffolk': 'Hampton Roads west',
  'Williamsburg': 'Historic Triangle and Colonial Williamsburg area',
  'Providence Forge': 'between Williamsburg and Richmond',
  'Fredericksburg': 'I-95 corridor between DC and Richmond',
  'Fairfax': 'DC suburbs in Northern Virginia',
  'Alexandria': 'DC border, NoVA',
  'Gainesville': 'NoVA exurbs',
  'South Riding': 'Loudoun County, NoVA',
  'Sterling': 'Loudoun County, NoVA',
  'Ashburn': 'Loudoun County, NoVA',
  'Lorton': 'Fairfax County, NoVA',
  'Leesburg': 'wine country in western Loudoun',
  'Irvington': 'Northern Neck on the Chesapeake Bay',
  'Wintergreen': 'Blue Ridge Mountains',
  'Zion Crossroads': 'Charlottesville area',
  'Front Royal': 'gateway to the Shenandoah Valley',
  'Harrisonburg': 'Shenandoah Valley',
  // CO
  'Denver': 'Front Range capital',
  'Aurora': 'east Denver metro',
  'Lakewood': 'west Denver metro along the foothills',
  'Brighton': 'north Denver metro',
  'Broomfield': 'between Denver and Boulder',
  'Lone Tree': 'south Denver metro',
  'Thornton': 'north Denver metro',
  'Evergreen': 'foothills west of Denver',
  'Colorado Springs': 'Front Range south of Denver',
  'Avon': 'Vail Valley',
  'Keystone': 'Summit County resort area',
  'Vail': 'Vail Valley',
  // AZ
  'Scottsdale': 'East Valley resort corridor of metro Phoenix',
  'Phoenix': 'Valley of the Sun',
  'Mesa': 'East Valley',
  'Chandler': 'East Valley',
  'Tucson': 'southern Arizona Sonoran desert',
  'Sedona': 'red-rock country',
  'Marana': 'NW of Tucson',
  // CA
  'San Diego': 'Pacific coast metro',
  'La Jolla': 'San Diego coast',
  'La Quinta': 'Coachella Valley desert',
  'Palm Springs': 'Coachella Valley',
  'Palm Desert': 'Coachella Valley',
  'Indian Wells': 'Coachella Valley',
  'Borrego Springs': 'Anza-Borrego desert',
  'Pebble Beach': 'Monterey Peninsula',
  'Half Moon Bay': 'Bay Area Pacific coast',
  'Pacifica': 'Bay Area Pacific coast',
  // TX
  'Houston': 'Gulf Coast metro',
  'Spring': 'north Houston metro',
  'Austin': 'Hill Country capital',
  'Round Rock': 'north Austin metro',
  'Bee Cave': 'west Austin Hill Country',
  'Dallas': 'DFW metroplex',
  'Frisco': 'north DFW',
  'McKinney': 'north DFW',
  'Plano': 'north DFW',
  'Arlington': 'DFW mid-cities',
  'Fort Worth': 'west DFW',
  'San Antonio': 'south Texas Hill Country',
  // FL
  'Orlando': 'Central Florida theme-park corridor',
  'Tampa': 'Tampa Bay',
  'Sarasota': 'Gulf Coast',
  'Naples': 'SW Florida Gulf',
  'Miami Beach': 'South Florida coast',
  'Pensacola': 'Panhandle Gulf coast',
  'Miramar Beach': 'Emerald Coast / Destin area',
  'Gulf Breeze': 'Pensacola Bay area',
  // GA
  'Atlanta': 'metro Atlanta',
  'Suwanee': 'north Atlanta suburbs',
  'Braselton': 'I-85 corridor north of Atlanta',
  'Stone Mountain': 'east Atlanta metro',
  'Canton': 'NW of Atlanta',
  'Acworth': 'NW Atlanta metro',
  'McDonough': 'south of Atlanta',
  // NV
  'Las Vegas': 'southern Nevada desert',
  'Henderson': 'south Las Vegas metro',
  'Mesquite': 'Mojave Desert near the AZ border',
  'Reno': 'northern Nevada / Sierra Nevada',
  // UT
  'Salt Lake City': 'Wasatch Front capital',
  'St. George': 'red-rock southwest Utah',
  'Provo': 'Utah County / Wasatch Front',
  'Park City': 'Wasatch Back ski-resort town',
  'Lehi': 'Silicon Slopes',
  // IL
  'Chicago': 'Lake Michigan metro',
  'Galena': 'NW Illinois bluff country',
  'Lemont': 'SW Chicago suburbs',
  'Naperville': 'west Chicago suburbs',
  'Buffalo Grove': 'north Chicago suburbs',
  'Lockport': 'SW Chicago suburbs',
  // MI
  'Roscommon': 'northern Lower Peninsula',
  'Gaylord': 'northern Lower Michigan, "Golf Mecca of the North"',
  'Bellaire': 'Lake Michigan northern coast',
  'Charlevoix': 'northern Michigan lakeshore',
  'Onaway': 'northern Lower Peninsula',
  'East Lansing': 'home of Michigan State University',
  'Grand Rapids': 'west Michigan',
  // NJ
  'Egg Harbor Township': 'Atlantic City area',
  'Cologne': 'Atlantic County',
  'Elmer': 'south Jersey farmland',
  'Lakewood': 'Ocean County',
  'Ringoes': 'Hunterdon County rolling hills',
  // AZ — Tucson area
  'Vail': 'east Tucson valley',
};

// Major in-state region context (used in city pages + state hubs)
const STATE_REGIONS = {
  arizona: 'Valley of the Sun, Tucson, Sedona, and surrounding desert',
  utah: 'Salt Lake Valley, St. George, and the Wasatch Front',
  california: 'San Diego, Coachella Valley, Bay Area, and beyond',
  texas: 'DFW, Houston, Austin, and the Hill Country',
  nevada: 'Las Vegas, Mesquite, Reno, and the Mojave',
  'south-carolina': 'Grand Strand, Charleston, and the Lowcountry',
  colorado: 'Front Range, Rockies resort country',
  florida: 'Central Florida, Tampa Bay, the Panhandle, and SE Florida',
  georgia: 'metro Atlanta and the I-85 corridor',
  illinois: 'Chicago metro, the suburbs, and Northwest Illinois',
  michigan: 'Northern Michigan, Detroit metro, and West Michigan',
  'new-jersey': 'the Jersey Shore, South Jersey, and Central/North NJ',
  'north-carolina': 'Pinehurst, the Triangle, OBX, Asheville, and the coast',
  virginia: 'Hampton Roads, NoVA, Williamsburg, Wintergreen, and the Shenandoah',
};

// ── Extract courses dict from index.html ─────────────────────────────────
const html = fs.readFileSync(INDEX_HTML, 'utf8');
const startIdx = html.indexOf('const courses = {');
if (startIdx === -1) { console.error('FATAL: could not find courses dict'); process.exit(1); }
let depth = 0, endIdx = -1;
for (let i = startIdx + 'const courses = '.length; i < html.length; i++) {
  const ch = html[i];
  if (ch === '{') depth++;
  else if (ch === '}') { depth--; if (depth === 0) { endIdx = i + 1; break; } }
}
const coursesObjLiteral = html.slice(startIdx + 'const courses = '.length, endIdx);
const courses = vm.runInNewContext('(' + coursesObjLiteral + ')');

console.log(`Extracted: ${Object.keys(courses).length} states, ${Object.values(courses).flat().length} courses`);

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

// Stable PRNG for deterministic variation by course name
function nameHash(name) {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) >>> 0;
  return h;
}
function pickOne(arr, seed) { return arr[seed % arr.length]; }

function ratingTierLanguage(rating, seed) {
  if (!rating) return pickOne(['a popular', 'a well-known', 'a frequently-played'], seed);
  if (rating >= 4.7) return pickOne(['one of the highest-rated', 'a destination-tier', 'a top-ranked'], seed);
  if (rating >= 4.4) return pickOne(['a top-rated', 'a highly-rated', 'a well-regarded'], seed);
  if (rating >= 4.1) return pickOne(['a well-rated', 'a popular', 'a solid'], seed);
  return pickOne(['a popular', 'a frequently-played', 'a local-favorite'], seed);
}

function cityContext(city) {
  return CITY_REGION[city] || null;
}

function pickSameCity(course, state) {
  return (courses[state] || []).filter(c => c.city === course.city && c.name !== course.name);
}
function pickNearby(course, state, n = 5) {
  const sameCity = pickSameCity(course, state);
  const otherCity = (courses[state] || []).filter(c => c.city !== course.city && c.name !== course.name);
  const seed = nameHash(course.name);
  const shuffled = otherCity.map((c, i) => ({ c, k: ((c.name.charCodeAt(0) || 0) * (i + 1) + seed) % 9973 })).sort((a, b) => a.k - b.k).map(x => x.c);
  return [...sameCity, ...shuffled].slice(0, n);
}

// FAQs — deterministically pick 4 from a templated pool per course
function buildFAQs(course, state, stateName, stateCode) {
  const seed = nameHash(course.name);
  const pool = [
    {
      q: `Is ${course.name} open to the public?`,
      a: `Yes. ${course.name} accepts public tee-time bookings. You can book directly through the course or via the Daily Tee Times homepage, where availability and pricing are surfaced in real time.`,
    },
    {
      q: `How do I book a tee time at ${course.name}?`,
      a: `Use the live availability widget above to see today's open tee times at ${course.name} with current pricing. Click any time slot to be taken straight to the course's booking page — there are no fees or signup requirements.`,
    },
    {
      q: `Where is ${course.name} located?`,
      a: cityContext(course.city)
        ? `${course.name} is in ${course.city}, ${stateName} — in the ${cityContext(course.city)}.`
        : `${course.name} is located in ${course.city}, ${stateName}.`,
    },
    {
      q: `What's the green fee at ${course.name}?`,
      a: `Green fees at ${course.name} vary by day, time of day, and season. Live pricing is shown next to each available tee time above — Daily Tee Times pulls real-time pricing from the course's booking system every 10 minutes.`,
    },
    {
      q: `Can I walk ${course.name}, or are carts required?`,
      a: `Walking and cart policy varies by course and time of day — typically twilight tee times are walking-only at most ${stateName} courses. Check the booking detail page on click-through for the specific cart/walking policy for your chosen tee time.`,
    },
    {
      q: `Does ${course.name} offer twilight rates?`,
      a: `Most public courses, including ${course.name}, offer discounted twilight rates for tee times within ~2 hours of sunset. These show up automatically in the live pricing above; sort by the Time of Day filter on the homepage to find them quickly.`,
    },
    {
      q: `How far in advance can I book ${course.name}?`,
      a: `Public tee times at ${course.name} are typically bookable 7-14 days in advance, depending on the course. Live availability above reflects everything currently open for booking.`,
    },
    {
      q: `What other courses are near ${course.name}?`,
      a: `Several other ${stateName} courses are within a short drive of ${course.name}. See the "More Courses Near ${course.city}" section below — Daily Tee Times aggregates live availability across all of them.`,
    },
  ];
  // Pick 4 of these, varied by course
  const indices = [seed % 8, (seed + 3) % 8, (seed + 5) % 8, (seed + 7) % 8];
  const seen = new Set(); const picked = [];
  for (const i of indices) { if (!seen.has(i)) { seen.add(i); picked.push(pool[i]); } if (picked.length === 4) break; }
  // Backfill if dedupe under 4
  for (let i = 0; picked.length < 4 && i < pool.length; i++) { if (!seen.has(i)) { seen.add(i); picked.push(pool[i]); } }
  return picked;
}

// ── Shared CSS ───────────────────────────────────────────────────────────
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
.main{max-width:880px;margin:0 auto;padding:32px}
.main h1{font-size:clamp(26px,4vw,36px);line-height:1.15;margin-bottom:6px;letter-spacing:-0.5px}
.location{color:var(--muted);font-size:15px;margin-bottom:6px}
.rating{color:var(--green-accent);font-size:14px;margin-bottom:24px;font-weight:600}
.intro p{margin:0 0 14px;color:var(--text);font-size:16px}
section.block{margin:28px 0;padding:24px;background:var(--card);border:1px solid var(--border);border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,0.03)}
section.block h2{font-size:20px;margin-bottom:14px;font-weight:700}
.tee-times-meta{font-size:13px;color:var(--muted);margin-bottom:14px}
.tee-times-grid{display:flex;flex-wrap:wrap;gap:8px}
.tee-time-btn{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 14px;background:var(--green-accent);color:var(--white)!important;border-radius:8px;font-size:11px;min-width:88px;transition:background 0.15s}
.tee-time-btn:hover{background:var(--green-deep);text-decoration:none}
.tee-time-btn .t-time{font-weight:700;font-size:14px}
.tee-time-btn .t-price{font-weight:600;font-size:13px}
.loading,.no-times{color:var(--muted);font-size:14px;padding:12px 0}
.how-list{padding-left:24px;color:var(--text);font-size:15px}
.how-list li{margin-bottom:6px}
.faq details{padding:14px 0;border-bottom:1px solid var(--border)}
.faq details:last-child{border-bottom:none}
.faq summary{font-weight:600;cursor:pointer;font-size:15px;list-style:none;padding-right:24px;position:relative;color:var(--text)}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:'+';position:absolute;right:0;top:-2px;font-size:22px;color:var(--muted);font-weight:400}
.faq details[open] summary::after{content:'−'}
.faq details p{margin-top:10px;color:var(--text);font-size:15px}
.nearby h2,.sister h2{font-size:18px;margin:32px 0 12px;font-weight:700}
.nearby-grid,.sister-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.nearby-card,.sister-card{padding:14px 16px;background:var(--card);border:1px solid var(--border);border-radius:10px;transition:border-color 0.15s}
.nearby-card:hover,.sister-card:hover{border-color:var(--green-accent)}
.nearby-card a,.sister-card a{display:block;color:var(--text)}
.nearby-card .nm,.sister-card .nm{font-weight:600;font-size:14px;margin-bottom:2px}
.nearby-card .ct,.sister-card .ct{color:var(--muted);font-size:12px}
.state-courses{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:24px}
.state-course{padding:16px 18px;background:var(--card);border:1px solid var(--border);border-radius:10px;transition:border-color 0.15s}
.state-course:hover{border-color:var(--green-accent)}
.state-course a{display:block;color:var(--text)}
.state-course .nm{font-weight:600;font-size:15px;margin-bottom:4px}
.state-course .ct{color:var(--muted);font-size:13px}
.city-header{font-size:14px;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);margin:28px 0 8px;font-weight:700;display:flex;justify-content:space-between;align-items:baseline}
.city-header a{font-size:12px;font-weight:400;text-transform:none;letter-spacing:0}
.city-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-top:16px}
.city-card{padding:14px 16px;background:var(--card);border:1px solid var(--border);border-radius:10px;transition:border-color 0.15s}
.city-card:hover{border-color:var(--green-accent)}
.city-card a{display:block;color:var(--text)}
.city-card .nm{font-weight:600;font-size:15px;margin-bottom:2px}
.city-card .ct{color:var(--muted);font-size:12px}
footer{background:var(--green-deep);padding:28px 24px;text-align:center;color:rgba(255,255,255,0.55);font-size:12px;margin-top:48px}
footer a{color:rgba(255,255,255,0.82)}
.footer-title{font-size:15px;font-weight:700;color:var(--white);margin-bottom:6px}
@media(max-width:600px){.main{padding:20px 18px}.header,.crumb{padding-left:18px;padding-right:18px}}
`;

const CF_BEACON = `<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "${CF_TOKEN}"}'></script>`;

// ── Course page ──────────────────────────────────────────────────────────
function renderCoursePage(course, state) {
  const stateName = STATE_NAMES[state];
  const stateCode = STATE_CODES[state];
  const slug = slugify(course.name);
  const citySlug = slugify(course.city);
  const courseUrl = `${SITE_URL}/${state}/${slug}/`;
  const cityUrl = `${SITE_URL}/${state}/${citySlug}/`;
  const seed = nameHash(course.name);
  const tier = ratingTierLanguage(course.rating, seed);
  const sister = pickSameCity(course, state).slice(0, 5);
  const nearby = pickNearby(course, state, 6).filter(c => !sister.some(s => s.name === c.name)).slice(0, 5);
  const ctxBlurb = cityContext(course.city);

  const openers = [
    `${course.name} is ${tier} public golf course in ${course.city}, ${stateName}.`,
    `Located in ${course.city}, ${stateName}, ${course.name} is ${tier} public-access course.`,
    `${course.name} ranks among ${course.city}'s ${tier === 'a popular' ? 'most-played' : tier.replace(/^a /,'')} golf courses${ctxBlurb ? ` in the ${ctxBlurb}` : ''}.`,
  ];
  const intro1 = pickOne(openers, seed);
  const intro2 = course.rating
    ? `With a ${course.rating}/5 rating from ${(course.reviews || 0).toLocaleString()} golfer reviews, it's earned a strong reputation among players in the ${course.city} area and across ${stateName}.`
    : `${course.city} is one of ${stateName}'s notable golf destinations, and ${course.name} is a regular pick for locals and travelers alike.`;
  const intro3 = `Daily Tee Times pulls real-time availability and pricing from ${course.name}'s booking system every 10 minutes. Today's open tee times are listed below — click any slot to book directly with the course. No fees, no signup required.`;

  // FAQ data + schema
  const faqs = buildFAQs(course, state, stateName, stateCode);
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  // GolfCourse schema
  const courseSchema = {
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
    courseSchema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: course.rating,
      reviewCount: course.reviews || 1,
      bestRating: 5,
      worstRating: 1,
    };
  }

  // Breadcrumb schema
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: stateName, item: `${SITE_URL}/${state}/` },
      { '@type': 'ListItem', position: 3, name: course.city, item: cityUrl },
      { '@type': 'ListItem', position: 4, name: course.name, item: courseUrl },
    ],
  };

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

<script type="application/ld+json">${JSON.stringify(courseSchema)}</script>
<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>

<style>${PAGE_CSS}</style>
</head>
<body>

<header class="header">
  <a class="logo" href="/">Daily Tee Times</a>
  <nav><a href="${cityUrl}">${htmlEscape(course.city)}</a><a href="/${state}/">${stateName}</a></nav>
</header>

<nav class="crumb"><a href="/">Home</a> &rsaquo; <a href="/${state}/">${stateName}</a> &rsaquo; <a href="${cityUrl}">${htmlEscape(course.city)}</a> &rsaquo; ${htmlEscape(course.name)}</nav>

<main class="main">
  <h1>${htmlEscape(course.name)}</h1>
  <div class="location">${htmlEscape(course.city)}, ${stateName}</div>
  ${course.rating ? `<div class="rating">★ ${course.rating} · ${(course.reviews || 0).toLocaleString()} reviews</div>` : ''}

  <section class="intro">
    <p>${intro1}</p>
    <p>${intro2}</p>
    <p>${intro3}</p>
  </section>

  <section class="block">
    <h2>Today's Tee Times at ${htmlEscape(course.name)}</h2>
    <div class="tee-times-meta" id="teeDate"></div>
    <div class="tee-times-grid" id="teeTimesGrid"><span class="loading">⏳ Loading live availability...</span></div>
  </section>

  ${ctxBlurb ? `<section class="block">
    <h2>About ${htmlEscape(course.city)} Golf</h2>
    <p>${htmlEscape(course.city)} sits in ${ctxBlurb}. ${course.name} is one of the area's public-access options${sister.length ? `, alongside ${sister.length} other ${sister.length === 1 ? 'course' : 'courses'} in town` : ''}. Daily Tee Times tracks live availability at every ${course.city} course so you can compare options at a glance.</p>
  </section>` : ''}

  <section class="block">
    <h2>How to Book a Tee Time at ${htmlEscape(course.name)}</h2>
    <ol class="how-list">
      <li>Check today's live availability above (or use the <a href="/">homepage</a> to pick a different date).</li>
      <li>Click the tee time and price that fits your group's plan — you'll be taken directly to ${htmlEscape(course.name)}'s booking page.</li>
      <li>Complete checkout with the course. Daily Tee Times charges no fees and requires no signup.</li>
      <li>(Optional) <a href="/">Set an alert on the homepage</a> to get notified when a tee time opens up at ${htmlEscape(course.name)}.</li>
    </ol>
  </section>

  <section class="block faq">
    <h2>Frequently Asked Questions</h2>
    ${faqs.map(f => `<details><summary>${htmlEscape(f.q)}</summary><p>${htmlEscape(f.a)}</p></details>`).join('')}
  </section>

  ${sister.length ? `<section class="sister">
    <h2>Other Courses in ${htmlEscape(course.city)}</h2>
    <div class="sister-grid">${sister.map(n => `<div class="sister-card"><a href="/${state}/${slugify(n.name)}/"><div class="nm">${htmlEscape(n.name)}</div><div class="ct">${htmlEscape(n.city)}, ${stateCode}</div></a></div>`).join('')}</div>
  </section>` : ''}

  ${nearby.length ? `<section class="nearby">
    <h2>More ${stateName} Courses</h2>
    <div class="nearby-grid">${nearby.map(n => `<div class="nearby-card"><a href="/${state}/${slugify(n.name)}/"><div class="nm">${htmlEscape(n.name)}</div><div class="ct">${htmlEscape(n.city)}, ${stateCode}</div></a></div>`).join('')}</div>
  </section>` : ''}
</main>

<footer>
  <div class="footer-title">Daily Tee Times</div>
  <div>Find and book tee times at 340+ golf courses nationally.</div>
  <div style="margin-top:8px"><a href="/">Home</a> &middot; <a href="${cityUrl}">${htmlEscape(course.city)}</a> &middot; <a href="/${state}/">${stateName}</a></div>
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

// ── City page ────────────────────────────────────────────────────────────
function renderCityPage(state, city, list) {
  const stateName = STATE_NAMES[state];
  const stateCode = STATE_CODES[state];
  const citySlug = slugify(city);
  const cityUrl = `${SITE_URL}/${state}/${citySlug}/`;
  const ctx = cityContext(city);
  const description = `Live tee times and prices at ${list.length} ${city}, ${stateCode} golf course${list.length === 1 ? '' : 's'}. Real-time availability, no fees, no signup.`;

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: stateName, item: `${SITE_URL}/${state}/` },
      { '@type': 'ListItem', position: 3, name: city, item: cityUrl },
    ],
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${htmlEscape(city)}, ${stateCode} Golf Tee Times — ${list.length} Course${list.length===1?'':'s'} | Daily Tee Times</title>
<meta name="description" content="${htmlEscape(description)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${cityUrl}">

<meta property="og:type" content="website">
<meta property="og:url" content="${cityUrl}">
<meta property="og:title" content="${htmlEscape(city)}, ${stateCode} Golf — ${list.length} Course${list.length===1?'':'s'}">
<meta property="og:description" content="${htmlEscape(description)}">
<meta property="og:site_name" content="Daily Tee Times">

<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>

<style>${PAGE_CSS}</style>
</head>
<body>

<header class="header">
  <a class="logo" href="/">Daily Tee Times</a>
  <nav><a href="/${state}/">${stateName}</a><a href="/">All States</a></nav>
</header>

<nav class="crumb"><a href="/">Home</a> &rsaquo; <a href="/${state}/">${stateName}</a> &rsaquo; ${htmlEscape(city)}</nav>

<main class="main">
  <h1>${htmlEscape(city)} Golf Tee Times</h1>
  <div class="location">${list.length} course${list.length===1?'':'s'} in ${city}, ${stateName}</div>

  <section class="intro" style="margin-top:24px">
    <p>Daily Tee Times aggregates real-time availability and pricing at every public-access golf course in <strong>${htmlEscape(city)}, ${stateName}</strong>. ${ctx ? `${htmlEscape(city)} sits in ${ctx}, with ${list.length} ${list.length===1?'course':'courses'} accepting public tee times.` : `${list.length} ${list.length===1?'course is':'courses are'} listed below.`}</p>
    <p>Click any course to see its current availability, today's pricing, and book directly. Or use the <a href="/">homepage</a> to filter all ${stateName} courses by date, players, and time of day.</p>
  </section>

  <div class="city-grid">
    ${list.sort((a,b)=>a.name.localeCompare(b.name)).map(c => `<div class="city-card"><a href="/${state}/${slugify(c.name)}/"><div class="nm">${htmlEscape(c.name)}</div><div class="ct">${c.rating ? `★ ${c.rating}` : 'View tee times'}${c.reviews ? ` · ${c.reviews.toLocaleString()} reviews` : ''}</div></a></div>`).join('')}
  </div>
</main>

<footer>
  <div class="footer-title">Daily Tee Times</div>
  <div>Find and book tee times at 340+ golf courses nationally.</div>
  <div style="margin-top:8px"><a href="/">Home</a> &middot; <a href="/${state}/">${stateName}</a></div>
  <div style="margin-top:8px;opacity:0.7">© 2026 Daily Tee Times. All rights reserved.</div>
</footer>

${CF_BEACON}
</body>
</html>`;
}

// ── State hub page ───────────────────────────────────────────────────────
function renderStatePage(state) {
  const stateName = STATE_NAMES[state];
  const stateCode = STATE_CODES[state];
  const stateUrl = `${SITE_URL}/${state}/`;
  const list = (courses[state] || []).slice().sort((a, b) => a.name.localeCompare(b.name));

  const byCity = {};
  for (const c of list) {
    if (!byCity[c.city]) byCity[c.city] = [];
    byCity[c.city].push(c);
  }
  const citiesSorted = Object.keys(byCity).sort();
  const totalCount = list.length;
  const regionBlurb = STATE_REGIONS[state] || '';
  const cityListInline = citiesSorted.slice(0, 12).join(', ');
  const description = `Live tee times and prices at ${totalCount} ${stateName} golf courses across ${citiesSorted.length} cities including ${cityListInline}. Real-time availability, no fees, no signup.`;

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: stateName, item: stateUrl },
    ],
  };

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

<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>

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
    <p>Daily Tee Times aggregates live availability and pricing at <strong>${totalCount} ${stateName} golf courses</strong>${regionBlurb ? ` across ${regionBlurb}` : ''}. From ${citiesSorted[0]} to ${citiesSorted[citiesSorted.length-1]}, you can compare today's tee times across the state in one place. Real-time data, refreshed every 10 minutes, no fees, no signup required.</p>
    <p>Click any course or city below to see its current availability and pricing — or use the <a href="/">homepage</a> to filter all ${totalCount} ${stateName} courses by date, players, and time of day.</p>
  </section>

  ${citiesSorted.map(city => `
    <h2 class="city-header"><span>${htmlEscape(city)} (${byCity[city].length})</span><a href="/${state}/${slugify(city)}/">View ${htmlEscape(city)} →</a></h2>
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

// ── Sitemap ──────────────────────────────────────────────────────────────
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

// ── Main ─────────────────────────────────────────────────────────────────
const sitemapUrls = [{ loc: SITE_URL + '/', changefreq: 'hourly', priority: '1.0' }];

let stateCount = 0, courseCount = 0, cityCount = 0;
for (const state of Object.keys(courses)) {
  if (!STATE_NAMES[state]) { console.warn(`skip unknown state: ${state}`); continue; }
  const stateDir = path.join(ROOT, state);
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'index.html'), renderStatePage(state));
  stateCount++;
  sitemapUrls.push({ loc: `${SITE_URL}/${state}/`, changefreq: 'daily', priority: '0.8' });

  // Group courses by city for city pages
  const byCity = {};
  for (const c of courses[state]) {
    if (!byCity[c.city]) byCity[c.city] = [];
    byCity[c.city].push(c);
  }
  for (const [city, list] of Object.entries(byCity)) {
    const citySlug = slugify(city);
    const cityDir = path.join(stateDir, citySlug);
    fs.mkdirSync(cityDir, { recursive: true });
    fs.writeFileSync(path.join(cityDir, 'index.html'), renderCityPage(state, city, list));
    cityCount++;
    sitemapUrls.push({ loc: `${SITE_URL}/${state}/${citySlug}/`, changefreq: 'daily', priority: '0.75' });
  }

  for (const course of courses[state]) {
    const slug = slugify(course.name);
    const courseDir = path.join(stateDir, slug);
    fs.mkdirSync(courseDir, { recursive: true });
    fs.writeFileSync(path.join(courseDir, 'index.html'), renderCoursePage(course, state));
    courseCount++;
    sitemapUrls.push({ loc: `${SITE_URL}/${state}/${slug}/`, changefreq: 'daily', priority: '0.7' });
  }
  console.log(`  ${state}: ${courses[state].length} course pages + ${Object.keys(byCity).length} city pages + 1 state hub`);
}

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), renderSitemap(sitemapUrls));

console.log(`\n✓ Generated:`);
console.log(`  ${stateCount} state hub pages`);
console.log(`  ${cityCount} city sub-pages`);
console.log(`  ${courseCount} course pages`);
console.log(`  1 sitemap.xml with ${sitemapUrls.length} URLs`);
