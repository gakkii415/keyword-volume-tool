import { applyCors, authorizeApp, configStatus, methodNotAllowed } from './_googleAds.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  if (!authorizeApp(req, res)) return;

  const status = configStatus();
  res.status(200).json({
    ok: true,
    configured: status.configured,
    missing: status.missing,
    apiVersion: status.apiVersion
  });
}
