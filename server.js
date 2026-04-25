require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Google Custom Search ─────────────────────────────────────────────────────
async function searchGoogle(query, count = 10, page = 1) {
  const apiKey = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CX;

  if (!apiKey || !cx) {
    return { error: 'Google API key or CX not configured', results: [] };
  }

  // Google allows max 10 per request; start is 1-based
  const perPage = Math.min(count, 10);
  const start = (page - 1) * perPage + 1;

  try {
    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: apiKey,
        cx,
        q: query,
        searchType: 'image',
        num: perPage,
        start,
        safe: 'off',
      },
      timeout: 10000,
    });

    const items = response.data.items || [];
    return {
      results: items.map((item) => ({
        title: item.title,
        thumbnail: item.image?.thumbnailLink || item.link,
        imageUrl: item.link,
        source: item.image?.contextLink || '',
        width: item.image?.width,
        height: item.image?.height,
        engine: 'google',
      })),
    };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    return { error: msg, results: [] };
  }
}

// ─── Bing Image Search ────────────────────────────────────────────────────────
async function searchBing(query, count = 20, page = 1) {
  const apiKey = process.env.BING_API_KEY;

  if (!apiKey) {
    return { error: 'Bing API key not configured', results: [] };
  }

  const perPage = Math.min(count, 35);
  const offset = (page - 1) * perPage;

  try {
    const response = await axios.get('https://api.bing.microsoft.com/v7.0/images/search', {
      headers: { 'Ocp-Apim-Subscription-Key': apiKey },
      params: { q: query, count: perPage, offset, safeSearch: 'Off' },
      timeout: 10000,
    });

    const items = response.data.value || [];
    return {
      results: items.map((item) => ({
        title: item.name,
        thumbnail: item.thumbnailUrl,
        imageUrl: item.contentUrl,
        source: item.hostPageUrl || '',
        width: item.width,
        height: item.height,
        engine: 'bing',
      })),
    };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    return { error: msg, results: [] };
  }
}

// ─── Yandex Image Search (scraping) ──────────────────────────────────────────
async function searchYandex(query, count = 20, page = 1) {
  try {
    const response = await axios.get('https://yandex.com/images/search', {
      params: {
        text: query,
        itype: 'jpg',
        format: 'json',
        p: page - 1, // 0-indexed
        request_extra: JSON.stringify({ blocks: [{ block: 'serp-controller' }] }),
      },
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: 'https://yandex.com/images/',
      },
      timeout: 12000,
    });

    let items = [];

    // Yandex may return JSON with image data
    if (response.data && response.data.blocks) {
      const serpBlock = response.data.blocks.find(
        (b) => b.name === 'serp-controller' || b.name === 'serp'
      );
      if (serpBlock && serpBlock.params && serpBlock.params.data) {
        items = serpBlock.params.data.items || [];
      }
    }

    // If JSON approach failed, fall back to HTML scraping
    if (items.length === 0) {
      return await scrapeYandexHtml(query, count, page);
    }

    return {
      results: items.slice(0, count).map((item) => ({
        title: item.snippet?.title || query,
        thumbnail: item.thumb?.url ? `https:${item.thumb.url}` : null,
        imageUrl: item.url || item.origUrl,
        source: item.snippet?.url || '',
        width: item.origWidth,
        height: item.origHeight,
        engine: 'yandex',
      })).filter((r) => r.imageUrl),
    };
  } catch {
    return await scrapeYandexHtml(query, count, page);
  }
}

async function scrapeYandexHtml(query, count = 20, page = 1) {
  try {
    const response = await axios.get('https://yandex.com/images/search', {
      params: { text: query, p: page - 1 },
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 12000,
    });

    const html = response.data;

    // Extract JSON data from the page's inline scripts
    const dataMatch = html.match(/data-bem="([^"]+)"/g);
    const results = [];

    if (dataMatch) {
      for (const attr of dataMatch.slice(0, count * 2)) {
        try {
          const jsonStr = attr
            .replace('data-bem="', '')
            .replace(/"$/, '')
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&');
          const data = JSON.parse(jsonStr);

          // Look for image data in the parsed object
          const imgData = data['serp-item'] || data['serp-panel-inner'];
          if (imgData && imgData.img_href) {
            results.push({
              title: imgData.snippet?.title || query,
              thumbnail: imgData.thumb?.url ? `https:${imgData.thumb.url}` : imgData.img_href,
              imageUrl: imgData.img_href,
              source: imgData.snippet?.url || '',
              width: imgData.w,
              height: imgData.h,
              engine: 'yandex',
            });
          }
        } catch {
          // skip malformed entries
        }
      }
    }

    // Fallback: parse <img> tags from the page
    if (results.length === 0) {
      const $ = cheerio.load(html);
      $('img.serp-item__thumb, img[class*="thumb"]').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (src && !src.startsWith('data:') && results.length < count) {
          results.push({
            title: $(el).attr('alt') || query,
            thumbnail: src.startsWith('//') ? `https:${src}` : src,
            imageUrl: src.startsWith('//') ? `https:${src}` : src,
            source: '',
            engine: 'yandex',
          });
        }
      });
    }

    if (results.length === 0) {
      return {
        error: 'Yandex scraping returned no results (may require cookies/JS rendering)',
        results: [],
      };
    }

    return { results: results.slice(0, count) };
  } catch (err) {
    return { error: `Yandex scraping failed: ${err.message}`, results: [] };
  }
}

// ─── Unsplash Image Search ────────────────────────────────────────────────────
async function searchUnsplash(query, count = 20, page = 1) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;

  if (!accessKey) {
    return { error: 'Unsplash access key not configured', results: [] };
  }

  try {
    const response = await axios.get('https://api.unsplash.com/search/photos', {
      headers: { Authorization: `Client-ID ${accessKey}` },
      params: {
        query,
        per_page: Math.min(count, 30),
        page,
      },
      timeout: 10000,
    });

    const items = response.data.results || [];
    return {
      results: items.map((item) => ({
        title: item.alt_description || item.description || query,
        thumbnail: item.urls.small,
        imageUrl: item.urls.full,
        source: item.links.html,
        width: item.width,
        height: item.height,
        engine: 'unsplash',
        author: item.user?.name,
        authorUrl: item.user?.links?.html,
        color: item.color,
      })),
    };
  } catch (err) {
    const msg = err.response?.data?.errors?.join(', ') || err.message;
    return { error: msg, results: [] };
  }
}

// ─── Pexels Image Search ──────────────────────────────────────────────────────
async function searchPexels(query, count = 20, page = 1) {
  const apiKey = process.env.PEXELS_API_KEY;

  if (!apiKey) {
    return { error: 'Pexels API key not configured', results: [] };
  }

  try {
    const response = await axios.get('https://api.pexels.com/v1/search', {
      headers: { Authorization: apiKey },
      params: {
        query,
        per_page: Math.min(count, 80),
        page,
      },
      timeout: 10000,
    });

    const items = response.data.photos || [];
    return {
      results: items.map((item) => ({
        title: item.alt || query,
        thumbnail: item.src.medium,
        imageUrl: item.src.original,
        source: item.url,
        width: item.width,
        height: item.height,
        engine: 'pexels',
        author: item.photographer,
        authorUrl: item.photographer_url,
      })),
    };
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    return { error: msg, results: [] };
  }
}

// ─── API Routes ───────────────────────────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  const { q, engine = 'all', count = 30, page = 1 } = req.query;

  if (!q || !q.trim()) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  const numCount = parseInt(count, 10) || 30;
  const numPage  = parseInt(page,  10) || 1;
  const engines = engine === 'all' ? ['google', 'bing', 'yandex', 'unsplash', 'pexels'] : [engine];

  const searchPromises = {};
  if (engines.includes('google'))   searchPromises.google   = searchGoogle(q, numCount, numPage);
  if (engines.includes('bing'))     searchPromises.bing     = searchBing(q, numCount, numPage);
  if (engines.includes('yandex'))   searchPromises.yandex   = searchYandex(q, numCount, numPage);
  if (engines.includes('unsplash')) searchPromises.unsplash = searchUnsplash(q, numCount, numPage);
  if (engines.includes('pexels'))   searchPromises.pexels   = searchPexels(q, numCount, numPage);

  const keys = Object.keys(searchPromises);
  const values = await Promise.allSettled(Object.values(searchPromises));

  const response = {};
  keys.forEach((key, i) => {
    const outcome = values[i];
    response[key] =
      outcome.status === 'fulfilled'
        ? outcome.value
        : { error: outcome.reason?.message, results: [] };
  });

  res.json(response);
});

// Health check / config status
app.get('/api/status', (req, res) => {
  res.json({
    google:   !!(process.env.GOOGLE_API_KEY && process.env.GOOGLE_CX),
    bing:     !!process.env.BING_API_KEY,
    yandex:   true, // scraping-based, no key needed
    unsplash: !!process.env.UNSPLASH_ACCESS_KEY,
    pexels:   !!process.env.PEXELS_API_KEY,
  });
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Image Search server running at http://localhost:${PORT}`);
});
