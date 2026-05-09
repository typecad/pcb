import * as sitemap from 'super-sitemap';

export const GET = async ({ params }) => {

  return await sitemap.response({
    origin: 'https://typecad.net',
    page: params.page,
    excludeRoutePatterns: [
      // '^/docs.*', // i.e. routes starting with `/dashboard`
      // '^/docs/package.*', // i.e. routes containing `[page=integer]`–e.g. `/blog/2`
      '^/news.*', // i.e. routes containing `[page=integer]`–e.g. `/blog/2`
      // '^/packages.*', // i.e. routes containing `[page=integer]`–e.g. `/blog/2`

    ],
  });
};