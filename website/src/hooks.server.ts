import { redirects } from '$lib/redirects';
import { redirect } from '@sveltejs/kit';

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  if (!event.url.pathname.endsWith('/')) {
    event.url.pathname += '/';
  }

  if (event.url.pathname in redirects) {
    throw redirect(301, redirects[event.url.pathname] as string);
  }

  // If no redirect is necessary, continue with the normal resolve process
  const response = await resolve(event);
  return response;
}
