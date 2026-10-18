/**
 * Plain /sitemap.xml — auditors and some crawlers look for this exact
 * filename. The @astrojs/sitemap integration also emits sitemap-index.xml;
 * both describe the same indexable routes (noindex pages excluded).
 */
import type { APIRoute } from 'astro';
import { CLASS_ORDER } from '@data/loadSnapshot';

const STATIC_ROUTES = [
  '/',
  '/about/',
  '/changes/',
  '/privacy/',
  '/terms/',
  '/sources/',
  '/talents/',
  '/changelog/',
  '/wow-forever-beta-end/',
];

export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL('https://wowforevertalentcalculator.com');
  const routes = [
    ...STATIC_ROUTES,
    ...CLASS_ORDER.flatMap((c) => [`/${c}/`, `/talents/${c}/`]),
  ];
  // Build date for unchanged routes. Pin a route only when its content changes.
  const buildLastmod = new Date().toISOString().slice(0, 10);
  const contentLastmod: Record<string, string> = {
    '/wow-forever-beta-end/': '2026-10-18',
  };
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map((route) => {
    const lastmod = contentLastmod[route] ?? buildLastmod;
    return `  <url><loc>${new URL(route, base).href}</loc><lastmod>${lastmod}</lastmod></url>`;
  })
  .join('\n')}
</urlset>
`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
