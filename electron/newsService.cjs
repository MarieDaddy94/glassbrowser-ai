const { XMLParser } = require('fast-xml-parser');

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_LIMIT = 12;
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

const TRUMP_REGEX = /\b(trump|donald\s+trump|trump\s+administration|trump\s+tariff|trump\s+tariffs|trump\s+sanction|trump\s+policy)\b/i;

const IMPACT_KEYWORDS = [
  'cpi',
  'inflation',
  'pce',
  'fomc',
  'fed',
  'interest rate',
  'rates',
  'jobs',
  'payroll',
  'gdp',
  'recession',
  'bank',
  'crisis',
  'default',
  'etf',
  'regulation',
  'sanction',
  'tariff',
  'war',
  'ceasefire',
  'hack',
  'exploit'
];

const POSITIVE_KEYWORDS = [
  'beat',
  'surge',
  'rally',
  'record high',
  'breakout',
  'upgrade',
  'bullish',
  'rate cut',
  'dovish',
  'approval',
  'etf approval',
  'strong demand',
  'inflows',
  'risk on'
];

const NEGATIVE_KEYWORDS = [
  'miss',
  'plunge',
  'selloff',
  'downgrade',
  'bearish',
  'rate hike',
  'hawkish',
  'ban',
  'sanction',
  'tariff',
  'lawsuit',
  'fraud',
  'hack',
  'exploit',
  'liquidation',
  'default',
  'risk off'
];

const SYMBOL_TOPICS = {
  XAUUSD: {
    name: 'Gold',
    keywords: ['gold', 'bullion', 'xau', 'usd', 'fed', 'cpi', 'inflation', 'real yields', 'treasury'],
    gdeltQuery: '"gold" OR "bullion" OR "XAUUSD" OR "real yields" OR "Federal Reserve" OR "CPI" OR "inflation"'
  },
  NAS100: {
    name: 'Nasdaq 100',
    keywords: ['nasdaq', 'nasdaq 100', 'tech stocks', 'mega-cap', 'ai', 'semiconductor', 'earnings', 'rates'],
    gdeltQuery: '"Nasdaq 100" OR "Nasdaq" OR "tech stocks" OR "semiconductor" OR "mega-cap" OR "AI stocks"'
  },
  US30: {
    name: 'Dow Jones',
    keywords: ['dow', 'dow jones', 'industrial average', 'blue chip', 'earnings', 'macro', 'rates'],
    gdeltQuery: '"Dow Jones" OR "Dow" OR "industrial average" OR "blue chip stocks"'
  },
  BTCUSD: {
    name: 'Bitcoin',
    keywords: ['bitcoin', 'btc', 'crypto', 'etf', 'exchange', 'sec', 'regulation', 'halving'],
    gdeltQuery: '"Bitcoin" OR "BTC" OR "crypto" OR "ETF" OR "exchange" OR "SEC" OR "halving"'
  }
};

const RSS_SOURCES = [
  { id: 'reuters_top', name: 'Reuters Top', url: 'https://feeds.reuters.com/reuters/topNews' },
  { id: 'reuters_business', name: 'Reuters Business', url: 'https://feeds.reuters.com/reuters/businessNews' },
  { id: 'cnbc', name: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  { id: 'marketwatch', name: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories/' },
  { id: 'yahoo_finance', name: 'Yahoo Finance', url: 'https://finance.yahoo.com/rss/topstories' },
  { id: 'nasdaq', name: 'Nasdaq', url: 'https://www.nasdaq.com/feed/rssoutbound?category=Market%20News' },
  { id: 'fxstreet', name: 'FXStreet', url: 'https://www.fxstreet.com/rss/news' },
  { id: 'forexlive', name: 'ForexLive', url: 'https://www.forexlive.com/feed/' },
  { id: 'kitco', name: 'Kitco', url: 'https://www.kitco.com/rss/' },
  { id: 'coindesk', name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { id: 'cointelegraph', name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { id: 'investing', name: 'Investing.com', url: 'https://www.investing.com/rss/news_25.rss' },
  { id: 'sec_press', name: 'SEC Press', url: 'https://www.sec.gov/rss/news/press.xml' },
  { id: 'sec_finance', name: 'SEC Finance', url: 'https://www.sec.gov/rss/news/fin.xml' },
  { id: 'fed_press', name: 'Federal Reserve', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
  { id: 'fed_monetary', name: 'Fed Monetary', url: 'https://www.federalreserve.gov/feeds/press_monetary.xml' },
  { id: 'bls', name: 'BLS', url: 'https://www.bls.gov/feed/news_release/most_recent.rss' }
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: 'text',
  removeNSPrefix: true
});

const toArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const countKeywordHits = (text, keywords) => {
  const haystack = String(text || '').toLowerCase();
  if (!haystack) return 0;
  const list = Array.isArray(keywords) ? keywords : [];
  let hits = 0;
  for (const raw of list) {
    const kw = String(raw || '').toLowerCase();
    if (!kw) continue;
    if (haystack.includes(kw)) hits += 1;
  }
  return hits;
};

const resolveTone = (text) => {
  const posHits = countKeywordHits(text, POSITIVE_KEYWORDS);
  const negHits = countKeywordHits(text, NEGATIVE_KEYWORDS);
  let tone = 'neutral';
  if (posHits > 0 && negHits > 0) tone = 'mixed';
  else if (posHits > 0) tone = 'positive';
  else if (negHits > 0) tone = 'negative';
  return { tone, toneScore: posHits - negHits };
};

const normalizeSymbolKey = (value) => {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  const afterColon = raw.includes(':') ? raw.split(':').pop() || raw : raw;
  const base = afterColon.split('.')[0] || afterColon;
  return base.replace(/[^A-Z0-9]/g, '');
};

const stripHtml = (value) => {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

const safeUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw;
};

const parseGdeltDate = (raw) => {
  const str = String(raw || '').trim();
  if (!str) return null;
  if (/^\d{14}$/.test(str)) {
    const year = Number(str.slice(0, 4));
    const month = Number(str.slice(4, 6)) - 1;
    const day = Number(str.slice(6, 8));
    const hour = Number(str.slice(8, 10));
    const minute = Number(str.slice(10, 12));
    const second = Number(str.slice(12, 14));
    const ts = Date.UTC(year, month, day, hour, minute, second);
    return Number.isFinite(ts) ? ts : null;
  }
  const parsed = Date.parse(str);
  return Number.isFinite(parsed) ? parsed : null;
};

const fetchWithTimeout = async (url, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  } finally {
    clearTimeout(timeout);
  }
};

const parseRssItems = (xml, source) => {
  const items = [];
  let parsed = null;
  try {
    parsed = parser.parse(xml);
  } catch {
    return items;
  }

  const channel = parsed?.rss?.channel || parsed?.channel || null;
  const feed = parsed?.feed || null;

  if (channel) {
    const channelTitle = channel?.title?.text || channel?.title || source?.name || '';
    for (const item of toArray(channel.item)) {
      const title = item?.title?.text || item?.title || '';
      const link = safeUrl(item?.link?.href || item?.link || '');
      const summary = stripHtml(item?.description || item?.summary?.text || item?.summary || '');
      const publishedAtMs = Date.parse(item?.pubDate || item?.published || item?.updated || '') || null;
      if (!title || !link) continue;
      items.push({
        title: String(title).trim(),
        url: link,
        summary,
        source: source?.name || channelTitle || null,
        publishedAtMs: Number.isFinite(publishedAtMs) ? publishedAtMs : null
      });
    }
    return items;
  }

  if (feed) {
    const feedTitle = feed?.title?.text || feed?.title || source?.name || '';
    for (const entry of toArray(feed.entry)) {
      const title = entry?.title?.text || entry?.title || '';
      const link = safeUrl(entry?.link?.href || entry?.link?.[0]?.href || entry?.link || '');
      const summary = stripHtml(entry?.summary?.text || entry?.summary || entry?.content?.text || entry?.content || '');
      const publishedAtMs = Date.parse(entry?.published || entry?.updated || '') || null;
      if (!title || !link) continue;
      items.push({
        title: String(title).trim(),
        url: link,
        summary,
        source: source?.name || feedTitle || null,
        publishedAtMs: Number.isFinite(publishedAtMs) ? publishedAtMs : null
      });
    }
  }
  return items;
};

const fetchRss = async (source) => {
  const res = await fetchWithTimeout(source.url, 9000);
  if (!res.ok || !res.text) return [];
  return parseRssItems(res.text, source);
};

const fetchGdelt = async (query, limit) => {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?format=json&mode=artlist&sort=hybridrel&maxrecords=${limit}&query=${encodeURIComponent(query)}`;
  const res = await fetchWithTimeout(url, 9000);
  if (!res.ok || !res.text) return [];
  let parsed = null;
  try {
    parsed = JSON.parse(res.text);
  } catch {
    return [];
  }
  const articles = Array.isArray(parsed?.articles) ? parsed.articles : [];
  return articles.map((item) => ({
    title: String(item?.title || '').trim(),
    url: safeUrl(item?.url),
    summary: String(item?.seentext || item?.snippet || '').trim(),
    source: String(item?.sourcecountry || item?.source || item?.domain || '').trim() || null,
    publishedAtMs: parseGdeltDate(item?.seendate || item?.seen_date || item?.datetime)
  })).filter((item) => item.title && item.url);
};

const computeImpactScore = (item, config) => {
  const text = `${item.title || ''} ${item.summary || ''}`.toLowerCase();
  const hits = countKeywordHits(text, config?.keywords || []);
  const impactHits = countKeywordHits(text, IMPACT_KEYWORDS);
  const tone = resolveTone(text);

  const now = Date.now();
  const ageMs = item.publishedAtMs ? Math.max(0, now - item.publishedAtMs) : null;
  let recencyScore = 3;
  if (ageMs != null) {
    const hours = ageMs / (60 * 60 * 1000);
    if (hours <= 1) recencyScore = 25;
    else if (hours <= 6) recencyScore = 18;
    else if (hours <= 24) recencyScore = 10;
    else if (hours <= 72) recencyScore = 5;
  }

  const trumpNews = TRUMP_REGEX.test(text);
  const trumpBoost = trumpNews ? 15 : 0;
  const score = clamp(hits * 12 + impactHits * 8 + recencyScore + trumpBoost, 0, 100);
  return { score, trumpNews, hits, tone: tone.tone, toneScore: tone.toneScore };
};

const buildSnapshot = (symbol, config, items, limit) => {
  const now = Date.now();
  const normalized = [];
  const dedupe = new Set();

  for (const item of items) {
    if (!item || !item.title || !item.url) continue;
    const dedupeKey = item.url || `${item.title}_${item.source || ''}_${item.publishedAtMs || ''}`;
    if (dedupe.has(dedupeKey)) continue;
    dedupe.add(dedupeKey);

    const impact = computeImpactScore(item, config);
    if (impact.hits <= 0) continue;

    normalized.push({
      title: item.title,
      url: item.url,
      summary: item.summary || null,
      source: item.source || null,
      publishedAtMs: item.publishedAtMs || null,
      impactScore: impact.score,
      trumpNews: impact.trumpNews,
      tone: impact.tone,
      toneScore: impact.toneScore
    });
  }

  normalized.sort((a, b) => (b.impactScore - a.impactScore) || ((b.publishedAtMs || 0) - (a.publishedAtMs || 0)));
  const sliced = normalized.slice(0, limit);
  const impactScore = sliced.length > 0 ? Math.max(...sliced.map((item) => item.impactScore || 0)) : 0;
  const impactLevel = impactScore >= 70 ? 'high' : impactScore >= 40 ? 'medium' : 'low';
  const trumpNews = sliced.some((item) => item.trumpNews);
  const toneScore = sliced.reduce((acc, item) => acc + (Number.isFinite(Number(item.toneScore)) ? Number(item.toneScore) : 0), 0);
  const posCount = sliced.filter((item) => item.tone === 'positive').length;
  const negCount = sliced.filter((item) => item.tone === 'negative').length;
  const mixedCount = sliced.filter((item) => item.tone === 'mixed').length;
  let tone = 'neutral';
  if (posCount > 0 && negCount > 0) tone = 'mixed';
  else if (mixedCount > 0 && posCount === 0 && negCount === 0) tone = 'mixed';
  else if (toneScore > 0) tone = 'positive';
  else if (toneScore < 0) tone = 'negative';
  const sources = Array.from(new Set(sliced.map((item) => item.source).filter(Boolean)));

  return {
    symbol,
    updatedAtMs: now,
    impactScore,
    impactLevel,
    trumpNews,
    tone,
    toneScore,
    sources,
    items: sliced
  };
};

class NewsService {
  constructor() {
    this.cache = new Map();
  }

  buildConfig(symbol) {
    const key = normalizeSymbolKey(symbol);
    const config = SYMBOL_TOPICS[key] || null;
    if (config) {
      return {
        key,
        name: config.name,
        keywords: Array.from(new Set([key, ...(config.keywords || [])])),
        gdeltQuery: config.gdeltQuery || `"${key}"`
      };
    }
    return {
      key,
      name: key,
      keywords: [key],
      gdeltQuery: key ? `"${key}"` : ''
    };
  }

  async getSnapshot(input = {}) {
    const symbol = String(input.symbol || '').trim();
    if (!symbol) return { ok: false, error: 'Symbol is required.' };
    const limit = Number.isFinite(Number(input.limit)) ? Math.max(3, Math.min(30, Math.floor(Number(input.limit)))) : DEFAULT_LIMIT;
    const force = input.force === true;
    const cacheKey = normalizeSymbolKey(symbol) || symbol.toUpperCase();
    const cached = this.cache.get(cacheKey);
    const now = Date.now();
    if (!force && cached && now - cached.fetchedAtMs < DEFAULT_TTL_MS) {
      return { ok: true, snapshot: cached.snapshot, cached: true };
    }

    const config = this.buildConfig(symbol);
    const query = config.gdeltQuery || `"${symbol}"`;
    const [gdeltRes, rssRes] = await Promise.allSettled([
      fetchGdelt(query, 40),
      Promise.all(RSS_SOURCES.map(fetchRss)).then((rows) => rows.flat())
    ]);

    const gdeltItems = gdeltRes.status === 'fulfilled' ? gdeltRes.value : [];
    const rssItems = rssRes.status === 'fulfilled' ? rssRes.value : [];
    const allItems = [...gdeltItems, ...rssItems].filter(Boolean);
    const snapshot = buildSnapshot(symbol, config, allItems, limit);

    this.cache.set(cacheKey, { snapshot, fetchedAtMs: now });
    return { ok: true, snapshot, cached: false };
  }
}

module.exports = { NewsService };
