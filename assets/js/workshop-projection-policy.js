const ALLOWED_PROJECTION_HOSTS = new Set([
  'www.youtube.com',
  'www.youtube-nocookie.com',
  'pedrohfernandes-klk.github.io'
]);

export const PROJECTION_IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-presentation';

export function allowlistedProjectionUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (!ALLOWED_PROJECTION_HOSTS.has(url.hostname.toLowerCase())) return null;
    return url.href;
  } catch {
    return null;
  }
}
