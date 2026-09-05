export const load = ({ url }) => {
  const { pathname } = url;

  return {
    pathname,
  };
};

import { dev } from '$app/environment';
import { injectAnalytics } from '@vercel/analytics/sveltekit';

injectAnalytics({ mode: dev ? 'development' : 'production' });
