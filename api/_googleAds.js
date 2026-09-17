import crypto from 'node:crypto';

const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v25';
const DEFAULT_ORIGINS = [
  'https://gakkii415.github.io',
  'http://localhost:3000',
  'http://localhost:8000',
  'http://127.0.0.1:8000'
];

let tokenCache = { accessToken: '', expiresAt: 0 };

export function configStatus() {
  const required = {
    GOOGLE_ADS_CLIENT_ID: process.env.GOOGLE_ADS_CLIENT_ID,
    GOOGLE_ADS_CLIENT_SECRET: process.env.GOOGLE_ADS_CLIENT_SECRET,
    GOOGLE_ADS_REFRESH_TOKEN: process.env.GOOGLE_ADS_REFRESH_TOKEN,
    GOOGLE_ADS_CUSTOMER_ID: process.env.GOOGLE_ADS_CUSTOMER_ID
  };
  const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
  return { configured: missing.length === 0, missing, apiVersion: API_VERSION };
}

export function cleanCustomerId(value) {
  return String(value || '').replace(/\D/g, '');
}

export function customerId() {
  return cleanCustomerId(process.env.GOOGLE_ADS_CUSTOMER_ID);
}

function configuredOrigins() {
  const raw = String(process.env.ALLOWED_ORIGINS || '').trim();
  if (!raw) return DEFAULT_ORIGINS;
  return raw.split(',').map(v => v.trim()).filter(Boolean);
}

function originAllowed(origin) {
  if (!origin) return true;
  const list = configuredOrigins();
  if (list.includes('*') || list.includes(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

export function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && originAllowed(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-token');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function authorizeApp(req, res) {
  const expected = process.env.APP_ACCESS_TOKEN;
  if (!expected) return true;
  const provided = req.headers['x-app-token'];
  if (!safeEqual(provided, expected)) {
    res.status(401).json({ error: 'アクセスキーが違います。接続設定を確認してください。' });
    return false;
  }
  return true;
}

export function requireConfigured(res) {
  const status = configStatus();
  if (status.configured) return true;
  res.status(503).json({
    error: `Google Ads API の環境変数が未設定です: ${status.missing.join(', ')}`,
    missing: status.missing
  });
  return false;
}

async function accessToken() {
  if (tokenCache.accessToken && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.GOOGLE_ADS_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || '',
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN || ''
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    const message = data.error_description || data.error || 'OAuthアクセストークンを取得できませんでした。';
    throw new Error(message);
  }
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000
  };
  return tokenCache.accessToken;
}

function extractGoogleError(data, status) {
  const failure = data?.error?.details?.find?.(d => Array.isArray(d.errors));
  const messages = failure?.errors?.map?.(e => e.message).filter(Boolean) || [];
  if (messages.length) return messages.join(' / ');
  return data?.error?.message || `Google Ads API エラー (${status})`;
}

export async function googleAdsFetch(path, { method = 'POST', body } = {}) {
  const token = await accessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // 2026-09-09以降はCloud projectのアクセスレベルが正本。
  // 既存環境との互換性のため、値がある場合のみdeveloper-tokenを送る。
  if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    headers['developer-token'] = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  }
  const loginCustomerId = cleanCustomerId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;

  const response = await fetch(`https://googleads.googleapis.com/${API_VERSION}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractGoogleError(data, response.status));
  return data;
}

export function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  res.status(405).json({ error: 'Method Not Allowed' });
}
