#!/usr/bin/env node
// scripts/build-pages.js — Static SEO page generator for dailyteetimes.com (v3)
//
// Reads the `courses` dict from index.html and emits:
//   /<state>/index.html                       — state hub
//   /<state>/<city-slug>/index.html           — city sub-page
//   /<state>/<course-slug>/index.html         — per-course landing
//   /<state>/best-golf-courses/index.html     — state Best Of (NEW v3)
//   /<state>/<city>/best-golf-courses/index.html — city Best Of (cities ≥4 courses, NEW v3)
//   /og/<scope>/<slug>.svg                    — per-page Open Graph image (NEW v3)
//   /sitemap.xml                              — XML sitemap
//
// v3 additions:
//   - GeoCoordinates in GolfCourse + City schema (curated lookup)
//   - "Best Of" listicle pages for high-value queries
//   - Auto-generated SVG OG images per page (branded social previews)
//   - Per-page <link rel="preconnect"> to the API for faster live-data load
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

// State centroids (lat, lng) for state-hub schema
const STATE_COORDS = {
  arizona: [34.2744, -111.6602], utah: [39.4199, -111.9509],
  california: [36.7783, -119.4179], texas: [31.0545, -97.5635],
  nevada: [38.3135, -117.0554], 'south-carolina': [33.8569, -80.9450],
  colorado: [39.5501, -105.7821], florida: [27.7663, -81.6868],
  georgia: [32.6415, -83.4426], illinois: [40.6331, -89.3985],
  michigan: [44.3148, -85.6024], 'new-jersey': [40.0583, -74.4057],
  'north-carolina': [35.7596, -79.0193], virginia: [37.4316, -78.6569],
};

// City coords — curated for cities where we have ≥1 course. Cities not in
// this table fall back to no geo schema (still indexed, just without local
// pack signal). Keyed by "state/city" so multi-state cities (Lakewood CO vs
// Lakewood NJ) are disambiguated.
const CITY_COORDS = {
  // ── Arizona ──
  'arizona/Scottsdale': [33.4942, -111.9261], 'arizona/Phoenix': [33.4484, -112.0740],
  'arizona/Mesa': [33.4152, -111.8315], 'arizona/Chandler': [33.3062, -111.8413],
  'arizona/Tucson': [32.2226, -110.9747], 'arizona/Sedona': [34.8697, -111.7610],
  'arizona/Gilbert': [33.3528, -111.7890], 'arizona/Tempe': [33.4255, -111.9400],
  'arizona/Peoria': [33.5806, -112.2374], 'arizona/Goodyear': [33.4353, -112.3576],
  'arizona/Surprise': [33.6292, -112.3680], 'arizona/Marana': [32.4366, -111.2253],
  'arizona/Fountain Hills': [33.6117, -111.7174], 'arizona/Cave Creek': [33.8333, -111.9509],
  'arizona/Prescott': [34.5400, -112.4685], 'arizona/Buckeye': [33.3703, -112.5838],
  'arizona/Queen Creek': [33.2487, -111.6343], 'arizona/Gold Canyon': [33.3729, -111.4348],
  'arizona/Maricopa': [33.0581, -112.0476], 'arizona/Tubac': [31.6113, -111.0461],
  'arizona/Vail': [32.0454, -110.7136],
  // ── California ──
  'california/San Diego': [32.7157, -117.1611], 'california/La Jolla': [32.8328, -117.2713],
  'california/La Quinta': [33.6634, -116.3100], 'california/Palm Springs': [33.8303, -116.5453],
  'california/Palm Desert': [33.7222, -116.3744], 'california/Indian Wells': [33.7177, -116.3441],
  'california/Borrego Springs': [33.2553, -116.3753], 'california/Half Moon Bay': [37.4636, -122.4286],
  'california/Pacifica': [37.6138, -122.4869], 'california/Long Beach': [33.7701, -118.1937],
  'california/Anaheim': [33.8366, -117.9143], 'california/Tustin': [33.7458, -117.8261],
  'california/San Jose': [37.3382, -121.8863], 'california/Palo Alto': [37.4419, -122.1430],
  'california/San Mateo': [37.5630, -122.3255], 'california/Alameda': [37.7652, -122.2416],
  'california/Mountain View': [37.3861, -122.0839], 'california/Vallejo': [38.1041, -122.2566],
  'california/Pasadena': [34.1478, -118.1445], 'california/Carlsbad': [33.1581, -117.3506],
  'california/Costa Mesa': [33.6411, -117.9187], 'california/Fullerton': [33.8704, -117.9242],
  'california/Brea': [33.9166, -117.9000], 'california/Diamond Bar': [34.0286, -117.8103],
  'california/Pomona': [34.0552, -117.7499], 'california/La Verne': [34.1009, -117.7678],
  'california/San Clemente': [33.4270, -117.6120], 'california/Dana Point': [33.4669, -117.6981],
  'california/Lake Forest': [33.6469, -117.6892], 'california/Yorba Linda': [33.8886, -117.8131],
  'california/El Segundo': [33.9192, -118.4165], 'california/Ventura': [34.2746, -119.2290],
  'california/Pico Rivera': [33.9831, -118.0967], 'california/Rosemead': [34.0806, -118.0728],
  'california/Alhambra': [34.0953, -118.1270], 'california/Granada Hills': [34.2729, -118.5061],
  'california/Santa Ana': [33.7455, -117.8677], 'california/Santee': [32.8384, -116.9739],
  'california/San Ramon': [37.7799, -121.9780], 'california/San Bernardino': [34.1083, -117.2898],
  'california/Chula Vista': [32.6401, -117.0842], 'california/Rancho Santa Margarita': [33.6406, -117.6031],
  'california/La Habra': [33.9319, -117.9462], 'california/Pacifica': [37.6138, -122.4869],
  'california/Auburn': [38.8966, -121.0769], 'california/Seaside': [36.6113, -121.8516],
  'california/Mckinleyville': [40.9446, -124.0853], 'california/Lake Almanor': [40.2304, -121.1638],
  'california/Brooks': [38.7305, -122.1391],
  // ── Colorado ──
  'colorado/Denver': [39.7392, -104.9903], 'colorado/Aurora': [39.7294, -104.8319],
  'colorado/Lakewood': [39.7047, -105.0814], 'colorado/Brighton': [39.9853, -104.8205],
  'colorado/Broomfield': [39.9205, -105.0866], 'colorado/Lone Tree': [39.5566, -104.8861],
  'colorado/Thornton': [39.8680, -104.9719], 'colorado/Evergreen': [39.6333, -105.3273],
  'colorado/Colorado Springs': [38.8339, -104.8214], 'colorado/Avon': [39.6312, -106.5226],
  'colorado/Keystone': [39.6058, -105.9536], 'colorado/Vail': [39.6403, -106.3742],
  // ── Florida ──
  'florida/Orlando': [28.5383, -81.3792], 'florida/Tampa': [27.9506, -82.4572],
  'florida/Sarasota': [27.3364, -82.5307], 'florida/Naples': [26.1420, -81.7948],
  'florida/Miami Beach': [25.7907, -80.1300], 'florida/Pensacola': [30.4213, -87.2169],
  'florida/Miramar Beach': [30.3852, -86.3679], 'florida/Gulf Breeze': [30.3580, -87.1639],
  'florida/Kissimmee': [28.2920, -81.4076], 'florida/Celebration': [28.3253, -81.5440],
  'florida/Davenport': [28.1614, -81.6020], 'florida/Winter Garden': [28.5651, -81.5862],
  'florida/Coral Springs': [26.2710, -80.2706], 'florida/Atlantis': [26.5926, -80.1009],
  'florida/Land O Lakes': [28.2169, -82.4612], 'florida/Lutz': [28.1511, -82.4615],
  'florida/Palm Harbor': [28.0780, -82.7637], 'florida/Ponte Vedra Beach': [30.2394, -81.3856],
  'florida/Sorrento': [28.8055, -81.5328], 'florida/Longwood': [28.7028, -81.3384],
  'florida/Harmony': [28.1859, -81.1593], 'florida/DeLand': [29.0283, -81.3031],
  // ── Georgia ──
  'georgia/Atlanta': [33.7490, -84.3880], 'georgia/Suwanee': [34.0515, -84.0713],
  'georgia/Braselton': [34.1090, -83.7674], 'georgia/Stone Mountain': [33.8081, -84.1702],
  'georgia/Canton': [34.2370, -84.4910], 'georgia/Acworth': [34.0664, -84.6777],
  'georgia/Tucker': [33.8546, -84.2174], 'georgia/Duluth': [34.0029, -84.1446],
  'georgia/Buford': [34.1209, -84.0085], 'georgia/Dacula': [33.9879, -83.8979],
  'georgia/Hoschton': [34.0918, -83.7607], 'georgia/Conyers': [33.6678, -84.0177],
  'georgia/Jonesboro': [33.5237, -84.3537], 'georgia/Waleska': [34.3193, -84.5535],
  'georgia/Rome': [34.2570, -85.1647], 'georgia/Savannah': [32.0809, -81.0912],
  // ── Illinois ──
  'illinois/Chicago': [41.8781, -87.6298], 'illinois/Galena': [42.4170, -90.4290],
  'illinois/Lemont': [41.6736, -87.9928], 'illinois/Naperville': [41.7508, -88.1535],
  'illinois/Buffalo Grove': [42.1517, -87.9612], 'illinois/Lockport': [41.5895, -88.0578],
  'illinois/Oak Brook': [41.8328, -87.9290], 'illinois/Bolingbrook': [41.6986, -88.0684],
  'illinois/Grayslake': [42.3441, -88.0420], 'illinois/Marengo': [42.2486, -88.6087],
  'illinois/Westmont': [41.7956, -87.9759], 'illinois/Channahon': [41.4264, -88.2287],
  'illinois/Waukegan': [42.3636, -87.8448],
  // ── Michigan ──
  'michigan/Roscommon': [44.4980, -84.5905], 'michigan/Gaylord': [45.0275, -84.6747],
  'michigan/Bellaire': [44.9789, -85.2090], 'michigan/Charlevoix': [45.3175, -85.2581],
  'michigan/Onaway': [45.3517, -84.2230], 'michigan/East Lansing': [42.7370, -84.4839],
  'michigan/Grand Rapids': [42.9634, -85.6681], 'michigan/Ann Arbor': [42.2808, -83.7430],
  'michigan/Clarkston': [42.7359, -83.4180], 'michigan/Plymouth': [42.3712, -83.4702],
  'michigan/New Hudson': [42.5095, -83.6107], 'michigan/Milford': [42.5901, -83.5994],
  'michigan/Shelby Twp': [42.6708, -83.0345], 'michigan/South Lyon': [42.4612, -83.6520],
  'michigan/Hamilton': [42.6798, -85.9686], 'michigan/Augusta': [42.3358, -85.3527],
  'michigan/Mt. Pleasant': [43.5978, -84.7676], 'michigan/Kewadin': [44.9203, -85.2966],
  'michigan/Lewiston': [44.8836, -84.3066], 'michigan/Jackson': [42.2459, -84.4014],
  // ── Nevada ──
  'nevada/Las Vegas': [36.1699, -115.1398], 'nevada/Henderson': [36.0395, -114.9817],
  'nevada/Mesquite': [36.8055, -114.0672], 'nevada/Reno': [39.5296, -119.8138],
  'nevada/North Las Vegas': [36.1989, -115.1175], 'nevada/Sparks': [39.5349, -119.7527],
  'nevada/Coyote Springs': [36.7780, -114.9722],
  // ── New Jersey ──
  'new-jersey/Egg Harbor Township': [39.3848, -74.6240], 'new-jersey/Cologne': [39.4523, -74.6043],
  'new-jersey/Elmer': [39.5970, -75.1707], 'new-jersey/Lakewood': [40.0976, -74.2176],
  'new-jersey/Ringoes': [40.4540, -74.8362], 'new-jersey/Princeton': [40.3573, -74.6672],
  'new-jersey/Ocean City': [39.2776, -74.5746], 'new-jersey/Mount Laurel': [39.9343, -74.8915],
  'new-jersey/Turnersville': [39.7587, -75.0521], 'new-jersey/Buena': [39.5151, -74.9332],
  'new-jersey/Pittsgrove': [39.5276, -75.1071], 'new-jersey/Somerset': [40.4974, -74.4884],
  'new-jersey/East Brunswick': [40.4276, -74.4163], 'new-jersey/Jefferson Township': [40.9698, -74.6388],
  // ── North Carolina ──
  'north-carolina/Southern Pines': [35.1740, -79.3925], 'north-carolina/Aberdeen': [35.1334, -79.4292],
  'north-carolina/Cary': [35.7915, -78.7811], 'north-carolina/Chapel Hill': [35.9132, -79.0558],
  'north-carolina/Nags Head': [35.9577, -75.6240], 'north-carolina/Powells Point': [36.0918, -75.8499],
  'north-carolina/Black Mountain': [35.6173, -82.3215], 'north-carolina/Etowah': [35.3273, -82.5993],
  'north-carolina/Leland': [34.2563, -78.0461], 'north-carolina/Calabash': [33.8910, -78.5786],
  'north-carolina/Sanford': [35.4799, -79.1803], 'north-carolina/Greensboro': [36.0726, -79.7920],
  'north-carolina/Asheboro': [35.7079, -79.8136],
  // ── South Carolina ──
  'south-carolina/Myrtle Beach': [33.6891, -78.8867], 'south-carolina/North Myrtle Beach': [33.8160, -78.6800],
  'south-carolina/Pawleys Island': [33.4271, -79.1217], 'south-carolina/Murrells Inlet': [33.5519, -79.0359],
  'south-carolina/Conway': [33.8360, -79.0478], 'south-carolina/Longs': [33.9043, -78.7378],
  'south-carolina/Mount Pleasant': [32.7942, -79.8625], 'south-carolina/Bluffton': [32.2371, -80.8606],
  'south-carolina/Columbia': [34.0007, -81.0348], 'south-carolina/Loris': [34.0571, -78.8908],
  'south-carolina/Little River': [33.8746, -78.6378], 'south-carolina/Greer': [34.9387, -82.2270],
  'south-carolina/Florence': [34.1954, -79.7626], 'south-carolina/Rock Hill': [34.9249, -81.0251],
  'south-carolina/Cat Island': [32.4015, -80.6800], 'south-carolina/North Augusta': [33.5018, -81.9651],
  // ── Texas ──
  'texas/Houston': [29.7604, -95.3698], 'texas/Spring': [30.0799, -95.4172],
  'texas/Austin': [30.2672, -97.7431], 'texas/Round Rock': [30.5083, -97.6789],
  'texas/Bee Cave': [30.3082, -97.9442], 'texas/Dallas': [32.7767, -96.7970],
  'texas/Frisco': [33.1507, -96.8236], 'texas/McKinney': [33.1972, -96.6398],
  'texas/Arlington': [32.7357, -97.1081], 'texas/Fort Worth': [32.7555, -97.3308],
  'texas/San Antonio': [29.4241, -98.4936], 'texas/Cedar Hill': [32.5885, -96.9561],
  'texas/Flower Mound': [33.0145, -97.0969], 'texas/Grapevine': [32.9343, -97.0781],
  'texas/Richardson': [32.9483, -96.7299], 'texas/North Richland Hills': [32.8343, -97.2289],
  'texas/Heath': [32.8395, -96.4744], 'texas/Weatherford': [32.7593, -97.7972],
  'texas/Burnet': [30.7585, -98.2280], 'texas/College Station': [30.6280, -96.3344],
  'texas/Brookeland': [31.1166, -94.0064], 'texas/Mercedes': [26.1490, -97.9114],
  'texas/Pecos': [31.4229, -103.4932], 'texas/Olney': [33.3690, -98.7548],
  'texas/Mart': [31.5435, -96.8333], 'texas/Caldwell': [30.5249, -96.6939],
  'texas/Bandera': [29.7269, -99.0735], 'texas/Beaumont': [30.0860, -94.1018],
  // ── Utah ──
  'utah/Salt Lake City': [40.7608, -111.8910], 'utah/St. George': [37.0965, -113.5684],
  'utah/Provo': [40.2338, -111.6585], 'utah/Park City': [40.6461, -111.4980],
  'utah/Lehi': [40.3916, -111.8508], 'utah/Sandy': [40.5649, -111.8389],
  'utah/Draper': [40.5247, -111.8638], 'utah/Riverton': [40.5219, -111.9391],
  'utah/Murray': [40.6669, -111.8880], 'utah/West Jordan': [40.6097, -111.9391],
  'utah/Taylorsville': [40.6677, -111.9388], 'utah/Magna': [40.7088, -112.1019],
  'utah/Layton': [41.0602, -111.9710], 'utah/Bountiful': [40.8894, -111.8808],
  'utah/Brigham City': [41.5102, -112.0155], 'utah/Logan': [41.7370, -111.8338],
  'utah/Morgan': [41.0413, -111.6760], 'utah/Tooele': [40.5308, -112.2982],
  'utah/Orem': [40.2969, -111.6946], 'utah/Spanish Fork': [40.1149, -111.6549],
  'utah/Payson': [40.0440, -111.7321], 'utah/Hurricane': [37.1750, -113.2891],
  'utah/Ivins': [37.1666, -113.6783],
  // ── Virginia ──
  'virginia/Virginia Beach': [36.8529, -75.9780], 'virginia/Chesapeake': [36.7682, -76.2875],
  'virginia/Suffolk': [36.7282, -76.5836], 'virginia/Williamsburg': [37.2707, -76.7075],
  'virginia/Providence Forge': [37.4527, -77.0633], 'virginia/Fredericksburg': [38.3032, -77.4605],
  'virginia/Fairfax': [38.8462, -77.3064], 'virginia/Alexandria': [38.8048, -77.0469],
  'virginia/Gainesville': [38.7965, -77.6147], 'virginia/South Riding': [38.9226, -77.5078],
  'virginia/Sterling': [39.0067, -77.4286], 'virginia/Ashburn': [39.0438, -77.4874],
  'virginia/Lorton': [38.7042, -77.2233], 'virginia/Leesburg': [39.1157, -77.5636],
  'virginia/Irvington': [37.6588, -76.4108], 'virginia/Wintergreen': [37.9090, -78.9444],
  'virginia/Zion Crossroads': [38.0473, -78.2783], 'virginia/Front Royal': [38.9182, -78.1944],
  'virginia/Harrisonburg': [38.4496, -78.8689],
};

// City region context (curated for ~140 metros)
const CITY_REGION = {
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
  'Myrtle Beach': 'Grand Strand — the heart of US golf-trip destinations',
  'North Myrtle Beach': 'Grand Strand',
  'Pawleys Island': 'south Grand Strand, home of classic seaside layouts',
  'Murrells Inlet': 'south Grand Strand',
  'Conway': 'inland from Myrtle Beach',
  'Longs': 'north Grand Strand',
  'Mount Pleasant': 'Charleston harbor area',
  'Bluffton': 'Hilton Head area',
  'Columbia': "SC's Midlands capital",
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
  'Scottsdale': 'East Valley resort corridor of metro Phoenix',
  'Phoenix': 'Valley of the Sun',
  'Mesa': 'East Valley',
  'Chandler': 'East Valley',
  'Tucson': 'southern Arizona Sonoran desert',
  'Sedona': 'red-rock country',
  'Marana': 'NW of Tucson',
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
  'Orlando': 'Central Florida theme-park corridor',
  'Tampa': 'Tampa Bay',
  'Sarasota': 'Gulf Coast',
  'Naples': 'SW Florida Gulf',
  'Miami Beach': 'South Florida coast',
  'Pensacola': 'Panhandle Gulf coast',
  'Miramar Beach': 'Emerald Coast / Destin area',
  'Gulf Breeze': 'Pensacola Bay area',
  'Atlanta': 'metro Atlanta',
  'Suwanee': 'north Atlanta suburbs',
  'Braselton': 'I-85 corridor north of Atlanta',
  'Stone Mountain': 'east Atlanta metro',
  'Canton': 'NW of Atlanta',
  'Acworth': 'NW Atlanta metro',
  'McDonough': 'south of Atlanta',
  'Las Vegas': 'southern Nevada desert',
  'Henderson': 'south Las Vegas metro',
  'Mesquite': 'Mojave Desert near the AZ border',
  'Reno': 'northern Nevada / Sierra Nevada',
  'Salt Lake City': 'Wasatch Front capital',
  'St. George': 'red-rock southwest Utah',
  'Provo': 'Utah County / Wasatch Front',
  'Park City': 'Wasatch Back ski-resort town',
  'Lehi': 'Silicon Slopes',
  'Chicago': 'Lake Michigan metro',
  'Galena': 'NW Illinois bluff country',
  'Lemont': 'SW Chicago suburbs',
  'Naperville': 'west Chicago suburbs',
  'Buffalo Grove': 'north Chicago suburbs',
  'Lockport': 'SW Chicago suburbs',
  'Roscommon': 'northern Lower Peninsula',
  'Gaylord': 'northern Lower Michigan, "Golf Mecca of the North"',
  'Bellaire': 'Lake Michigan northern coast',
  'Charlevoix': 'northern Michigan lakeshore',
  'Onaway': 'northern Lower Peninsula',
  'East Lansing': 'home of Michigan State University',
  'Grand Rapids': 'west Michigan',
  'Egg Harbor Township': 'Atlantic City area',
  'Cologne': 'Atlantic County',
  'Elmer': 'south Jersey farmland',
  'Lakewood': 'Ocean County',
  'Ringoes': 'Hunterdon County rolling hills',
};

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

// SVG escape — same as HTML but stricter on quotes
function svgEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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

function cityContext(city) { return CITY_REGION[city] || null; }
function cityCoords(state, city) { return CITY_COORDS[`${state}/${city}`] || null; }

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

function buildFAQs(course, state, stateName, stateCode) {
  const seed = nameHash(course.name);
  const pool = [
    { q: `Is ${course.name} open to the public?`,
      a: `Yes. ${course.name} accepts public tee-time bookings. You can book directly through the course or via the Daily Tee Times homepage, where availability and pricing are surfaced in real time.` },
    { q: `How do I book a tee time at ${course.name}?`,
      a: `Use the live availability widget above to see today's open tee times at ${course.name} with current pricing. Click any time slot to be taken straight to the course's booking page — there are no fees or signup requirements.` },
    { q: `Where is ${course.name} located?`,
      a: cityContext(course.city)
        ? `${course.name} is in ${course.city}, ${stateName} — in the ${cityContext(course.city)}.`
        : `${course.name} is located in ${course.city}, ${stateName}.` },
    { q: `What's the green fee at ${course.name}?`,
      a: `Green fees at ${course.name} vary by day, time of day, and season. Live pricing is shown next to each available tee time above — Daily Tee Times pulls real-time pricing from the course's booking system every 10 minutes.` },
    { q: `Can I walk ${course.name}, or are carts required?`,
      a: `Walking and cart policy varies by course and time of day — typically twilight tee times are walking-only at most ${stateName} courses. Check the booking detail page on click-through for the specific cart/walking policy for your chosen tee time.` },
    { q: `Does ${course.name} offer twilight rates?`,
      a: `Most public courses, including ${course.name}, offer discounted twilight rates for tee times within ~2 hours of sunset. These show up automatically in the live pricing above; sort by the Time of Day filter on the homepage to find them quickly.` },
    { q: `How far in advance can I book ${course.name}?`,
      a: `Public tee times at ${course.name} are typically bookable 7-14 days in advance, depending on the course. Live availability above reflects everything currently open for booking.` },
    { q: `What other courses are near ${course.name}?`,
      a: `Several other ${stateName} courses are within a short drive of ${course.name}. See the "More Courses Near ${course.city}" section below — Daily Tee Times aggregates live availability across all of them.` },
  ];
  const indices = [seed % 8, (seed + 3) % 8, (seed + 5) % 8, (seed + 7) % 8];
  const seen = new Set(); const picked = [];
  for (const i of indices) { if (!seen.has(i)) { seen.add(i); picked.push(pool[i]); } if (picked.length === 4) break; }
  for (let i = 0; picked.length < 4 && i < pool.length; i++) { if (!seen.has(i)) { seen.add(i); picked.push(pool[i]); } }
  return picked;
}

// ── OG image generator (SVG, 1200x630) ───────────────────────────────────
// Wraps long titles across up to 2 lines. Brand-styled with green-deep
// background, green-accent border, white wordmark.
function wrapTitle(title, maxChars = 22) {
  if (title.length <= maxChars) return [title, ''];
  const words = title.split(/\s+/);
  let line1 = ''; let line2 = '';
  for (const w of words) {
    if ((line1 + ' ' + w).trim().length <= maxChars) line1 = (line1 + ' ' + w).trim();
    else line2 = (line2 + ' ' + w).trim();
  }
  return [line1, line2];
}

function renderOgImage({ title, subtitle, rating, kicker }) {
  const [t1, t2] = wrapTitle(title, 22);
  const t1y = t2 ? 230 : 270;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2e5031"/>
      <stop offset="100%" stop-color="#1a2a1c"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="32" y="32" width="1136" height="566" fill="none" stroke="#4a7c50" stroke-width="3" rx="24"/>
  <text x="80" y="120" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-size="24" fill="rgba(255,255,255,0.55)" font-weight="600" letter-spacing="3">DAILY TEE TIMES</text>
  ${kicker ? `<text x="80" y="170" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-size="22" fill="#7eb085" font-weight="600">${svgEscape(kicker)}</text>` : ''}
  <text x="80" y="${t1y}" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-size="76" fill="#ffffff" font-weight="800">${svgEscape(t1)}</text>
  ${t2 ? `<text x="80" y="${t1y + 86}" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-size="76" fill="#ffffff" font-weight="800">${svgEscape(t2)}</text>` : ''}
  <text x="80" y="${t2 ? 410 : 350}" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-size="34" fill="rgba(255,255,255,0.85)">${svgEscape(subtitle)}</text>
  ${rating ? `<text x="80" y="${t2 ? 470 : 410}" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-size="26" fill="#7eb085" font-weight="700">★ ${rating} rating</text>` : ''}
  <text x="80" y="555" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-size="22" fill="rgba(255,255,255,0.55)">Live tee times · No fees · No signup</text>
</svg>
`;
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
.ranked-list{margin-top:20px;display:flex;flex-direction:column;gap:14px}
.ranked-item{display:flex;gap:18px;align-items:flex-start;padding:18px 20px;background:var(--card);border:1px solid var(--border);border-radius:12px}
.rank{flex:0 0 48px;height:48px;border-radius:50%;background:var(--green-deep);color:var(--white);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800}
.ranked-item-body{flex:1}
.ranked-item-body h3{font-size:17px;margin-bottom:2px}
.ranked-item-body h3 a{color:var(--text)}
.ranked-item-meta{font-size:13px;color:var(--muted);margin-bottom:6px}
.ranked-item-rating{color:var(--green-accent);font-weight:700;font-size:14px;margin-bottom:6px}
.ranked-item-desc{color:var(--text);font-size:14px}
.cta-block{margin:32px 0;padding:24px;background:var(--green-deep);color:var(--white);border-radius:12px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
.cta-block strong{font-size:18px;font-weight:700;display:block}
.cta-block span{color:rgba(255,255,255,0.75);font-size:14px}
.cta-btn{padding:12px 22px;background:var(--green-light);color:var(--green-deep)!important;border-radius:8px;font-weight:700;font-size:14px}
.cta-btn:hover{background:var(--white);text-decoration:none}
footer{background:var(--green-deep);padding:28px 24px;text-align:center;color:rgba(255,255,255,0.55);font-size:12px;margin-top:48px}
footer a{color:rgba(255,255,255,0.82)}
.footer-title{font-size:15px;font-weight:700;color:var(--white);margin-bottom:6px}
@media(max-width:600px){.main{padding:20px 18px}.header,.crumb{padding-left:18px;padding-right:18px}.cta-block{flex-direction:column;align-items:flex-start}}
`;

const PRECONNECT = `<link rel="preconnect" href="${API_BASE}"><link rel="preconnect" href="https://static.cloudflareinsights.com">`;
const CF_BEACON = `<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "${CF_TOKEN}"}'></script>`;

// ── Course page ──────────────────────────────────────────────────────────
function renderCoursePage(course, state) {
  const stateName = STATE_NAMES[state];
  const stateCode = STATE_CODES[state];
  const slug = slugify(course.name);
  const citySlug = slugify(course.city);
  const courseUrl = `${SITE_URL}/${state}/${slug}/`;
  const cityUrl = `${SITE_URL}/${state}/${citySlug}/`;
  const ogUrl = `${SITE_URL}/og/${state}/${slug}.svg`;
  const seed = nameHash(course.name);
  const tier = ratingTierLanguage(course.rating, seed);
  const sister = pickSameCity(course, state).slice(0, 5);
  const nearby = pickNearby(course, state, 6).filter(c => !sister.some(s => s.name === c.name)).slice(0, 5);
  const ctxBlurb = cityContext(course.city);
  const coords = cityCoords(state, course.city);

  const openers = [
    `${course.name} is ${tier} public golf course in ${course.city}, ${stateName}.`,
    `Located in ${course.city}, ${stateName}, ${course.name} is ${tier} public-access course.`,
    `${course.name} ranks among ${course.city}'s ${tier === 'a popular' ? 'most-played' : tier.replace(/^a /, '')} golf courses${ctxBlurb ? ` in the ${ctxBlurb}` : ''}.`,
  ];
  const intro1 = pickOne(openers, seed);
  const intro2 = course.rating
    ? `With a ${course.rating}/5 rating from ${(course.reviews || 0).toLocaleString()} golfer reviews, it's earned a strong reputation among players in the ${course.city} area and across ${stateName}.`
    : `${course.city} is one of ${stateName}'s notable golf destinations, and ${course.name} is a regular pick for locals and travelers alike.`;
  const intro3 = `Daily Tee Times pulls real-time availability and pricing from ${course.name}'s booking system every 10 minutes. Today's open tee times are listed below — click any slot to book directly with the course. No fees, no signup required.`;

  const faqs = buildFAQs(course, state, stateName, stateCode);
  const faqSchema = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };

  const courseSchema = {
    '@context': 'https://schema.org', '@type': 'GolfCourse', name: course.name,
    address: { '@type': 'PostalAddress', addressLocality: course.city, addressRegion: stateCode, addressCountry: 'US' },
    url: courseUrl, image: ogUrl,
  };
  if (course.rating) {
    courseSchema.aggregateRating = {
      '@type': 'AggregateRating', ratingValue: course.rating, reviewCount: course.reviews || 1,
      bestRating: 5, worstRating: 1,
    };
  }
  if (coords) {
    courseSchema.geo = { '@type': 'GeoCoordinates', latitude: coords[0], longitude: coords[1] };
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
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
${PRECONNECT}

<meta property="og:type" content="website">
<meta property="og:url" content="${courseUrl}">
<meta property="og:title" content="${htmlEscape(course.name)} Tee Times — ${htmlEscape(course.city)}, ${stateCode}">
<meta property="og:description" content="Live tee times at ${htmlEscape(course.name)} in ${htmlEscape(course.city)}, ${stateName}. Real-time pricing and availability.">
<meta property="og:image" content="${ogUrl}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:site_name" content="Daily Tee Times">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ogUrl}">

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

  <div class="cta-block">
    <div><strong>Browse ${stateName} courses by rating</strong><span>See the highest-rated public courses in ${stateName}</span></div>
    <a class="cta-btn" href="/${state}/best-golf-courses/">Best ${stateName} courses →</a>
  </div>

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
  const ogUrl = `${SITE_URL}/og/${state}/${citySlug}.svg`;
  const ctx = cityContext(city);
  const coords = cityCoords(state, city);
  const description = `Live tee times and prices at ${list.length} ${city}, ${stateCode} golf course${list.length === 1 ? '' : 's'}. Real-time availability, no fees, no signup.`;
  const hasBestOf = list.length >= 4;

  const placeSchema = {
    '@context': 'https://schema.org', '@type': 'Place', name: `${city}, ${stateName}`, url: cityUrl,
    address: { '@type': 'PostalAddress', addressLocality: city, addressRegion: stateCode, addressCountry: 'US' },
  };
  if (coords) placeSchema.geo = { '@type': 'GeoCoordinates', latitude: coords[0], longitude: coords[1] };

  const breadcrumbSchema = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
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
<title>${htmlEscape(city)}, ${stateCode} Golf Tee Times — ${list.length} Course${list.length === 1 ? '' : 's'} | Daily Tee Times</title>
<meta name="description" content="${htmlEscape(description)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${cityUrl}">
${PRECONNECT}

<meta property="og:type" content="website">
<meta property="og:url" content="${cityUrl}">
<meta property="og:title" content="${htmlEscape(city)}, ${stateCode} Golf — ${list.length} Course${list.length === 1 ? '' : 's'}">
<meta property="og:description" content="${htmlEscape(description)}">
<meta property="og:image" content="${ogUrl}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:site_name" content="Daily Tee Times">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ogUrl}">

<script type="application/ld+json">${JSON.stringify(placeSchema)}</script>
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
  <div class="location">${list.length} course${list.length === 1 ? '' : 's'} in ${city}, ${stateName}</div>

  <section class="intro" style="margin-top:24px">
    <p>Daily Tee Times aggregates real-time availability and pricing at every public-access golf course in <strong>${htmlEscape(city)}, ${stateName}</strong>. ${ctx ? `${htmlEscape(city)} sits in ${ctx}, with ${list.length} ${list.length === 1 ? 'course' : 'courses'} accepting public tee times.` : `${list.length} ${list.length === 1 ? 'course is' : 'courses are'} listed below.`}</p>
    <p>Click any course to see its current availability, today's pricing, and book directly. Or use the <a href="/">homepage</a> to filter all ${stateName} courses by date, players, and time of day.</p>
  </section>

  ${hasBestOf ? `<div class="cta-block">
    <div><strong>Best Golf Courses in ${htmlEscape(city)}</strong><span>${list.length} courses ranked by golfer rating</span></div>
    <a class="cta-btn" href="/${state}/${citySlug}/best-golf-courses/">View ranked list →</a>
  </div>` : ''}

  <div class="city-grid">
    ${list.sort((a, b) => a.name.localeCompare(b.name)).map(c => `<div class="city-card"><a href="/${state}/${slugify(c.name)}/"><div class="nm">${htmlEscape(c.name)}</div><div class="ct">${c.rating ? `★ ${c.rating}` : 'View tee times'}${c.reviews ? ` · ${c.reviews.toLocaleString()} reviews` : ''}</div></a></div>`).join('')}
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

// ── State hub ────────────────────────────────────────────────────────────
function renderStatePage(state) {
  const stateName = STATE_NAMES[state];
  const stateCode = STATE_CODES[state];
  const stateUrl = `${SITE_URL}/${state}/`;
  const ogUrl = `${SITE_URL}/og/${state}.svg`;
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
  const coords = STATE_COORDS[state];

  const placeSchema = {
    '@context': 'https://schema.org', '@type': 'AdministrativeArea', name: stateName, url: stateUrl,
  };
  if (coords) placeSchema.geo = { '@type': 'GeoCoordinates', latitude: coords[0], longitude: coords[1] };

  const breadcrumbSchema = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
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
${PRECONNECT}

<meta property="og:type" content="website">
<meta property="og:url" content="${stateUrl}">
<meta property="og:title" content="${stateName} Golf Tee Times — ${totalCount} Courses">
<meta property="og:description" content="Live tee times at ${totalCount} ${stateName} golf courses. Real-time availability, no fees, no signup.">
<meta property="og:image" content="${ogUrl}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:site_name" content="Daily Tee Times">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ogUrl}">

<script type="application/ld+json">${JSON.stringify(placeSchema)}</script>
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
    <p>Daily Tee Times aggregates live availability and pricing at <strong>${totalCount} ${stateName} golf courses</strong>${regionBlurb ? ` across ${regionBlurb}` : ''}. From ${citiesSorted[0]} to ${citiesSorted[citiesSorted.length - 1]}, you can compare today's tee times across the state in one place. Real-time data, refreshed every 10 minutes, no fees, no signup required.</p>
    <p>Click any course or city below to see its current availability and pricing — or use the <a href="/">homepage</a> to filter all ${totalCount} ${stateName} courses by date, players, and time of day.</p>
  </section>

  <div class="cta-block">
    <div><strong>Best Golf Courses in ${stateName}</strong><span>${totalCount} courses ranked by golfer rating</span></div>
    <a class="cta-btn" href="/${state}/best-golf-courses/">View ranked list →</a>
  </div>

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

// ── Best Of page (state OR city scope) ──────────────────────────────────
function renderBestOfPage({ state, city = null, list }) {
  const stateName = STATE_NAMES[state];
  const stateCode = STATE_CODES[state];
  const scope = city ? `${city}, ${stateCode}` : stateName;
  const scopeUrl = city ? `${SITE_URL}/${state}/${slugify(city)}/best-golf-courses/` : `${SITE_URL}/${state}/best-golf-courses/`;
  const parentUrl = city ? `${SITE_URL}/${state}/${slugify(city)}/` : `${SITE_URL}/${state}/`;
  const ogSlug = city ? `${state}/${slugify(city)}-best` : `${state}-best`;
  const ogUrl = `${SITE_URL}/og/${ogSlug}.svg`;

  // Rank by (rating desc, reviews desc as tiebreaker). Drop unrated entries to the bottom.
  const ranked = list.slice().sort((a, b) => {
    const ra = a.rating || 0, rb = b.rating || 0;
    if (rb !== ra) return rb - ra;
    return (b.reviews || 0) - (a.reviews || 0);
  });
  const cap = Math.min(ranked.length, 25);
  const top = ranked.slice(0, cap);

  const description = `The ${cap} highest-rated public golf courses in ${scope}. Ranked by golfer reviews, with live tee-time availability and pricing for each.`;

  const itemListSchema = {
    '@context': 'https://schema.org', '@type': 'ItemList',
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    numberOfItems: cap,
    itemListElement: top.map((c, i) => ({
      '@type': 'ListItem', position: i + 1,
      item: {
        '@type': 'GolfCourse', name: c.name, url: `${SITE_URL}/${state}/${slugify(c.name)}/`,
        address: { '@type': 'PostalAddress', addressLocality: c.city, addressRegion: stateCode, addressCountry: 'US' },
        ...(c.rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: c.rating, reviewCount: c.reviews || 1, bestRating: 5, worstRating: 1 } } : {}),
      },
    })),
  };
  const breadcrumbSchema = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: city ? [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: stateName, item: `${SITE_URL}/${state}/` },
      { '@type': 'ListItem', position: 3, name: city, item: `${SITE_URL}/${state}/${slugify(city)}/` },
      { '@type': 'ListItem', position: 4, name: `Best Golf Courses`, item: scopeUrl },
    ] : [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: stateName, item: `${SITE_URL}/${state}/` },
      { '@type': 'ListItem', position: 3, name: `Best Golf Courses`, item: scopeUrl },
    ],
  };

  const title = `Best Public Golf Courses in ${scope} — Top ${cap} Ranked`;
  const h1 = `Best Public Golf Courses in ${scope}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} | Daily Tee Times</title>
<meta name="description" content="${htmlEscape(description)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${scopeUrl}">
${PRECONNECT}

<meta property="og:type" content="website">
<meta property="og:url" content="${scopeUrl}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${htmlEscape(description)}">
<meta property="og:image" content="${ogUrl}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:site_name" content="Daily Tee Times">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ogUrl}">

<script type="application/ld+json">${JSON.stringify(itemListSchema)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>

<style>${PAGE_CSS}</style>
</head>
<body>

<header class="header">
  <a class="logo" href="/">Daily Tee Times</a>
  <nav>${city ? `<a href="${parentUrl}">${htmlEscape(city)}</a>` : ''}<a href="/${state}/">${stateName}</a></nav>
</header>

<nav class="crumb">
  <a href="/">Home</a> &rsaquo; <a href="/${state}/">${stateName}</a>
  ${city ? ` &rsaquo; <a href="${parentUrl}">${htmlEscape(city)}</a>` : ''}
  &rsaquo; Best Golf Courses
</nav>

<main class="main">
  <h1>${h1}</h1>
  <div class="location">Top ${cap} public courses ranked by golfer rating</div>

  <section class="intro" style="margin-top:24px">
    <p>These are the <strong>${cap} highest-rated public-access golf courses</strong> in ${scope}, ranked by aggregated golfer reviews. Daily Tee Times pulls live availability and pricing from each course's booking system every 10 minutes — click any course below to see today's open tee times and book directly. No fees, no signup.</p>
    <p>Rankings reflect average golfer rating (weighted by review count). Most ${city ? 'in town' : 'across the state'} accept tee-time reservations 7-14 days in advance via their direct booking system.</p>
  </section>

  <div class="ranked-list">
    ${top.map((c, i) => `<div class="ranked-item">
      <div class="rank">${i + 1}</div>
      <div class="ranked-item-body">
        <h3><a href="/${state}/${slugify(c.name)}/">${htmlEscape(c.name)}</a></h3>
        <div class="ranked-item-meta">${htmlEscape(c.city)}, ${stateCode}</div>
        ${c.rating ? `<div class="ranked-item-rating">★ ${c.rating}${c.reviews ? ` · ${c.reviews.toLocaleString()} reviews` : ''}</div>` : ''}
        <div class="ranked-item-desc">${(() => {
          const seed = nameHash(c.name);
          const tier = ratingTierLanguage(c.rating, seed);
          const ctx = cityContext(c.city);
          if (ctx) return `${htmlEscape(tier.charAt(0).toUpperCase() + tier.slice(1))} course in ${htmlEscape(c.city)} (${ctx}). <a href="/${state}/${slugify(c.name)}/">See today's tee times →</a>`;
          return `${htmlEscape(tier.charAt(0).toUpperCase() + tier.slice(1))} ${htmlEscape(c.city)} course. <a href="/${state}/${slugify(c.name)}/">See today's tee times →</a>`;
        })()}</div>
      </div>
    </div>`).join('')}
  </div>

  <div class="cta-block" style="margin-top:32px">
    <div><strong>Browse all ${list.length} ${scope} courses</strong><span>Filter by city, date, players, time of day</span></div>
    <a class="cta-btn" href="${city ? parentUrl : '/' + state + '/'}">Browse all →</a>
  </div>
</main>

<footer>
  <div class="footer-title">Daily Tee Times</div>
  <div>Find and book tee times at 340+ golf courses nationally.</div>
  <div style="margin-top:8px"><a href="/">Home</a> &middot; <a href="/${state}/">${stateName}</a>${city ? ` &middot; <a href="${parentUrl}">${htmlEscape(city)}</a>` : ''}</div>
  <div style="margin-top:8px;opacity:0.7">© 2026 Daily Tee Times. All rights reserved.</div>
</footer>

${CF_BEACON}
</body>
</html>`;
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
const ogRoot = path.join(ROOT, 'og');
fs.mkdirSync(ogRoot, { recursive: true });

let stateCount = 0, courseCount = 0, cityCount = 0, bestOfCount = 0, ogCount = 0;

for (const state of Object.keys(courses)) {
  if (!STATE_NAMES[state]) { console.warn(`skip unknown state: ${state}`); continue; }
  const stateName = STATE_NAMES[state];
  const stateCode = STATE_CODES[state];
  const stateDir = path.join(ROOT, state);
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(path.join(ogRoot, state), { recursive: true });

  // State hub
  fs.writeFileSync(path.join(stateDir, 'index.html'), renderStatePage(state));
  stateCount++;
  sitemapUrls.push({ loc: `${SITE_URL}/${state}/`, changefreq: 'daily', priority: '0.85' });
  // State OG
  fs.writeFileSync(path.join(ogRoot, `${state}.svg`), renderOgImage({
    title: stateName, subtitle: `${courses[state].length} golf courses`,
    kicker: 'STATE GUIDE',
  }));
  ogCount++;

  // State Best Of (always, unless state has <3 courses)
  if (courses[state].length >= 3) {
    const bestDir = path.join(stateDir, 'best-golf-courses');
    fs.mkdirSync(bestDir, { recursive: true });
    fs.writeFileSync(path.join(bestDir, 'index.html'), renderBestOfPage({ state, list: courses[state] }));
    bestOfCount++;
    sitemapUrls.push({ loc: `${SITE_URL}/${state}/best-golf-courses/`, changefreq: 'weekly', priority: '0.9' });
    fs.writeFileSync(path.join(ogRoot, `${state}-best.svg`), renderOgImage({
      title: `Best ${stateName} Golf`,
      subtitle: `Top ${Math.min(courses[state].length, 25)} ranked courses`,
      kicker: 'BEST OF',
    }));
    ogCount++;
  }

  // City pages + city Best Of pages
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
    // City OG
    fs.writeFileSync(path.join(ogRoot, state, `${citySlug}.svg`), renderOgImage({
      title: city, subtitle: `${list.length} golf course${list.length === 1 ? '' : 's'} · ${stateName}`,
      kicker: 'CITY',
    }));
    ogCount++;

    // City Best Of for cities with 4+ courses
    if (list.length >= 4) {
      const cityBestDir = path.join(cityDir, 'best-golf-courses');
      fs.mkdirSync(cityBestDir, { recursive: true });
      fs.writeFileSync(path.join(cityBestDir, 'index.html'), renderBestOfPage({ state, city, list }));
      bestOfCount++;
      sitemapUrls.push({ loc: `${SITE_URL}/${state}/${citySlug}/best-golf-courses/`, changefreq: 'weekly', priority: '0.85' });
      fs.writeFileSync(path.join(ogRoot, state, `${citySlug}-best.svg`), renderOgImage({
        title: `Best ${city} Golf`, subtitle: `Top ${Math.min(list.length, 25)} ranked courses · ${stateCode}`,
        kicker: 'BEST OF',
      }));
      ogCount++;
    }
  }

  // Course pages
  for (const course of courses[state]) {
    const slug = slugify(course.name);
    const courseDir = path.join(stateDir, slug);
    fs.mkdirSync(courseDir, { recursive: true });
    fs.writeFileSync(path.join(courseDir, 'index.html'), renderCoursePage(course, state));
    courseCount++;
    sitemapUrls.push({ loc: `${SITE_URL}/${state}/${slug}/`, changefreq: 'daily', priority: '0.7' });
    // Course OG
    fs.writeFileSync(path.join(ogRoot, state, `${slug}.svg`), renderOgImage({
      title: course.name, subtitle: `${course.city}, ${stateCode}`, rating: course.rating,
    }));
    ogCount++;
  }
  console.log(`  ${state}: ${courses[state].length} course pages + ${Object.keys(byCity).length} city pages + 1 state hub + ${(courses[state].length >= 3 ? 1 : 0) + Object.values(byCity).filter(l => l.length >= 4).length} best-of`);
}

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), renderSitemap(sitemapUrls));

console.log(`\n✓ Generated:`);
console.log(`  ${stateCount} state hub pages`);
console.log(`  ${cityCount} city sub-pages`);
console.log(`  ${courseCount} course pages`);
console.log(`  ${bestOfCount} "Best Of" listicle pages`);
console.log(`  ${ogCount} OG SVG images`);
console.log(`  1 sitemap.xml with ${sitemapUrls.length} URLs`);
