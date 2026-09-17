import {
  applyCors,
  authorizeApp,
  googleAdsFetch,
  methodNotAllowed,
  requireConfigured
} from './_googleAds.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  if (!authorizeApp(req, res)) return;
  if (!requireConfigured(res)) return;

  const q = String(req.query?.q || '').trim().slice(0, 80);
  const locale = String(req.query?.locale || 'ja').trim().slice(0, 10);
  const countryCode = String(req.query?.countryCode || '').trim().toUpperCase().slice(0, 2);
  if (q.length < 2) return res.status(200).json({ locations: [] });

  const request = {
    locale,
    locationNames: { names: [q] }
  };
  if (countryCode) request.countryCode = countryCode;

  try {
    const data = await googleAdsFetch('/geoTargetConstants:suggest', {
      method: 'POST',
      body: request
    });
    const locations = (data.geoTargetConstantSuggestions || [])
      .map(item => ({
        resourceName: item.geoTargetConstant?.resourceName || '',
        id: item.geoTargetConstant?.id || null,
        name: item.geoTargetConstant?.name || '',
        canonicalName: item.geoTargetConstant?.canonicalName || '',
        countryCode: item.geoTargetConstant?.countryCode || '',
        targetType: item.geoTargetConstant?.targetType || '',
        status: item.geoTargetConstant?.status || '',
        reach: item.reach || null
      }))
      .filter(item => item.resourceName && item.status !== 'REMOVAL_PLANNED');

    res.status(200).json({ locations });
  } catch (error) {
    console.error('Google Ads geo target error', error);
    res.status(502).json({ error: error.message || '地域候補を取得できませんでした。' });
  }
}
