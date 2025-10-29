import posthog from './vendor/posthog.mjs';

const POSTHOG_KEY = 'REDACTED_POSTHOG_KEY';
const POSTHOG_HOST = 'https://eu.i.posthog.com';
const DEFAULTS_MARKER = '2025-05-24';

function isLocalHost(hostname) {
  if (!hostname) return false;
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower === '0.0.0.0' || lower === '::1') return true;
  if (lower.startsWith('127.')) return true;
  if (lower.endsWith('.local')) return true;
  return false;
}

if (typeof window !== 'undefined' && !window.__POSTHOG_INIT__) {
  const hostname = window.location?.hostname ?? '';
  const disableAnalytics = isLocalHost(hostname);

  if (disableAnalytics) {
    posthog.opt_out_capturing?.();
    window.__POSTHOG_INIT__ = true;
    window.posthog = posthog;
  } else {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: false,
      persistence: 'localStorage',
      defaults: DEFAULTS_MARKER
    });

    posthog.register({ defaults: DEFAULTS_MARKER });
    posthog.capture('$pageview');

    window.__POSTHOG_INIT__ = true;
    window.posthog = posthog;
  }
}

export default posthog;
