import {
  applyCors,
  authorizeApp,
  customerId,
  googleAdsFetch,
  methodNotAllowed,
  requireConfigured
} from './_googleAds.js';

function cleanKeywords(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(v => String(v || '').trim()).filter(Boolean))].slice(0, 100);
}

function cleanResources(value, prefix, max) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(v => String(v || '').trim()).filter(v => v.startsWith(prefix)))].slice(0, max);
}

function normalizeResult(result) {
  const metrics = result.keywordMetrics || {};
  return {
    text: result.text || '',
    closeVariants: result.closeVariants || [],
    avgMonthlySearches: metrics.avgMonthlySearches ?? null,
    competition: metrics.competition || null,
    competitionIndex: metrics.competitionIndex ?? null,
    lowTopOfPageBidMicros: metrics.lowTopOfPageBidMicros ?? null,
    highTopOfPageBidMicros: metrics.highTopOfPageBidMicros ?? null,
    averageCpcMicros: metrics.averageCpcMicros ?? null,
    monthlySearchVolumes: metrics.monthlySearchVolumes || []
  };
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!authorizeApp(req, res)) return;
  if (!requireConfigured(res)) return;

  const keywords = cleanKeywords(req.body?.keywords);
  const geoTargetConstants = cleanResources(req.body?.geoTargetConstants, 'geoTargetConstants/', 10);
  const language = String(req.body?.language || '').trim();

  if (!keywords.length) {
    return res.status(400).json({ error: 'キーワードを1件以上指定してください。' });
  }
  if (!geoTargetConstants.length) {
    return res.status(400).json({ error: '地域を指定してください。' });
  }
  if (language && !/^languageConstants\/\d+$/.test(language)) {
    return res.status(400).json({ error: '言語指定が不正です。' });
  }

  const request = {
    keywords,
    geoTargetConstants,
    keywordPlanNetwork: 'GOOGLE_SEARCH',
    includeAdultKeywords: false,
    historicalMetricsOptions: { includeAverageCpc: true }
  };
  if (language) request.language = language;

  try {
    const id = customerId();
    const data = await googleAdsFetch(`/customers/${id}:generateKeywordHistoricalMetrics`, {
      method: 'POST',
      body: request
    });
    res.status(200).json({
      results: (data.results || []).map(normalizeResult),
      meta: {
        requestedKeywords: keywords.length,
        returnedKeywords: (data.results || []).length,
        geoTargetConstants,
        language: language || null
      }
    });
  } catch (error) {
    console.error('Google Ads historical metrics error', error);
    res.status(502).json({ error: error.message || '検索ボリュームを取得できませんでした。' });
  }
}
