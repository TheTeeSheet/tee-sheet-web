// Netlify serverless function - proxies EZ Links API via ScraperAPI
// Called as: /.netlify/functions/ezlinks-proxy?subdomain=mccormickranch&date=2026-03-22&players=2

const SCRAPER_API_KEY = '27f403b316a3cccff464a55aaf96c949';

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const params = event.queryStringParameters || {};
  const subdomain = params.subdomain;
  const date = params.date;
  const players = parseInt(params.players) || 2;

  if (!subdomain || !date) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing subdomain or date' }) };
  }

  const CONFIGS = {
    mccormickranch: { courseIds: [495, 496], name: 'McCormick Ranch Golf Club' },
    tokasticks: { courseIds: [919], name: 'Toka Sticks Golf Club' },
    westernskies: { courseIds: [17936, 24819], name: 'Western Skies Golf Club' },
  };

  const config = CONFIGS[subdomain];
  if (!config) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Unknown subdomain: ' + subdomain }) };
  }

  const parts = date.split('-');
  const dateFormatted = parts[1] + '/' + parts[2] + '/' + parts[0];
  const baseUrl = 'https://' + subdomain + '.ezlinksgolf.com';
  const targetUrl = baseUrl + '/api/search/search';

  const postBody = JSON.stringify({
    p01: config.courseIds,
    p02: dateFormatted,
    p03: '5:00 AM',
    p04: '7:00 PM',
    p05: 0,
    p06: players,
    p07: false,
  });

  try {
    // Use ScraperAPI to proxy the request through residential IPs
    const scraperUrl = 'https://api.scraperapi.com?api_key=' + SCRAPER_API_KEY
      + '&url=' + encodeURIComponent(targetUrl)
      + '&method=POST'
      + '&keep_headers=true';

    const response = await fetch(scraperUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': baseUrl,
        'Referer': baseUrl + '/index.html',
      },
      body: postBody,
    });

    if (!response.ok) {
      var errText = '';
      try { errText = await response.text(); } catch(e) {}
      return { statusCode: response.status, headers, body: JSON.stringify({ error: 'EZ Links HTTP ' + response.status, detail: errText.slice(0, 200) }) };
    }

    const data = await response.json();
    const slots = data.r06 || [];

    const teeTimes = slots.map(function(tt) {
      return {
        time: tt.r24,
        course: config.name,
        subCourse: tt.r16 || '',
        price: tt.r08 ? '$' + tt.r08 + (tt.r09 && tt.r09 !== tt.r08 ? '-$' + tt.r09 : '') : 'N/A',
        holes: 18,
        players: (tt.r14 || 4) + '',
        bookingUrl: baseUrl + '/index.html#/search',
      };
    });

    return { statusCode: 200, headers, body: JSON.stringify({ course: config.name, platform: 'ezlinks', teeTimes }) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
