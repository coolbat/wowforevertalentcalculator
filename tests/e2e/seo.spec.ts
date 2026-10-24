import { expect, test } from '@playwright/test';

/** PRD §15.3 SEO acceptance + JS-disabled readability (§15.2 flow 9). */

const PAGES = [
  { path: '/', title: 'WoW Forever Talent Calculator — Free Online, No Sign-Up', noindex: false },
  { path: '/mage/', title: /WoW Forever Mage Talent Calculator/, noindex: false },
  { path: '/warrior/', title: /WoW Forever Warrior Talent Calculator/, noindex: false },
  { path: '/shaman/', title: /WoW Forever Shaman Talent Calculator/, noindex: false },
  { path: '/talents/', title: /Talent Reference/, noindex: false },
  { path: '/talents/mage/', title: /WoW Forever Mage Talent Tree & Talents/, noindex: false },
  { path: '/changes/', title: /Talent Changes/, noindex: false },
  { path: '/changelog/', title: 'WoW Forever Talent Calculator Changelog & Data Updates', noindex: false },
  { path: '/wow-forever-beta-end/', title: 'WoW Forever Beta End Date & Stress Test (Closed): Oct 21 & Nov 4', noindex: false },
  { path: '/sources/', title: /Data & Sources|Sources/, noindex: false },
  { path: '/about/', title: /About/, noindex: false },
  { path: '/privacy/', title: /Privacy/, noindex: false },
  { path: '/terms/', title: /Terms/, noindex: false },
  { path: '/contact/', title: /Contact/, noindex: false },
  { path: '/blog/', title: /Blog/, noindex: false },
  { path: '/blog/how-to-use-the-wow-forever-talent-calculator/', title: /How to Use the WoW Forever Talent Calculator/, noindex: false },
  { path: '/blog/wow-forever-talent-points-levels-and-row-gates/', title: /Talent Points, Levels and Row Gates/, noindex: false },
  { path: '/blog/where-wow-forever-talent-data-comes-from/', title: /Where WoW Forever Talent Data Comes From/, noindex: false },
  { path: '/blog/wow-forever-beta-end-and-launch-talent-planning/', title: /Beta End and Nov 4 Launch/, noindex: false },
  { path: '/blog/wow-forever-druid-talent-trees-beta-data/', title: /Druid Talents/, noindex: false },
  { path: '/compare/', title: /Compare/, noindex: true },
  { path: '/my-builds/', title: /My Builds/, noindex: true },
];

function unescapeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

for (const p of PAGES) {
  test(`${p.path}: title, canonical, meta, H1`, async ({ request, baseURL }) => {
    const res = await request.get(p.path);
    expect(res.status()).toBe(200);
    const html = await res.text();

    const title = unescapeEntities(/<title>([^<]+)<\/title>/.exec(html)?.[1] ?? '');
    expect(title).toBeTruthy();
    if (typeof p.title === 'string') expect(title).toBe(p.title);
    else expect(title).toMatch(p.title);

    // Self-referencing canonical with trailing slash.
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
    expect(canonical).toBe(`${baseURL?.replace(/:\d+/, '').replace('http://localhost', 'https://wowforevertalentcalculator.com')}${p.path}`.replace(/\/$/, '') + '/');

    const description = /<meta name="description" content="([^"]+)"/.exec(html)?.[1];
    expect(description?.length ?? 0).toBeGreaterThan(40);

    const h1Count = (html.match(/<h1[\s>]/g) ?? []).length;
    expect(h1Count).toBe(1);

    const robots = /<meta name="robots" content="([^"]+)"/.exec(html)?.[1];
    if (p.noindex) expect(robots).toContain('noindex');
    else expect(robots ?? '').not.toContain('noindex');
  });
}

test('all 9 class calculator pages exist with unique titles', async ({ request }) => {
  const classes = ['warrior', 'paladin', 'hunter', 'rogue', 'priest', 'shaman', 'mage', 'warlock', 'druid'];
  const titles = new Set<string>();
  for (const c of classes) {
    const res = await request.get(`/${c}/`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    const title = /<title>([^<]+)<\/title>/.exec(html)?.[1];
    expect(titles.has(title!)).toBe(false);
    titles.add(title!);
    // Priest third tree must be "Shadow", never "Shadow Magic".
    if (c === 'priest') {
      expect(html).not.toContain('Shadow Magic');
      expect(html).toContain('Shadow');
    }
  }
});

test('home page has WebApplication JSON-LD without fabricated ratings', async ({ request }) => {
  const html = await (await request.get('/')).text();
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
  const blocks = scripts.map((m) => JSON.parse(m[1]) as { '@type': string });
  const app = blocks.find((b) => b['@type'] === 'WebApplication');
  expect(app).toBeTruthy();
  expect((app as Record<string, unknown>).aggregateRating).toBeUndefined();
  // Entity anchors: Organization + WebSite + dated WebPage on every page.
  const types = blocks.map((b) => b['@type']);
  expect(types).toContain('Organization');
  expect(types).toContain('WebSite');
  const webPage = blocks.find((b) => b['@type'] === 'WebPage') as Record<string, unknown>;
  expect(webPage).toBeTruthy();
  expect(webPage.datePublished).toBeTruthy();
  expect(webPage.dateModified).toBeTruthy();
  expect(webPage.author).toBeTruthy();
});

test('home links one hop to all 18 class pages with descriptive anchors', async ({ request }) => {
  const classes = ['warrior', 'paladin', 'hunter', 'rogue', 'priest', 'shaman', 'mage', 'warlock', 'druid'];
  const html = await (await request.get('/')).text();
  for (const c of classes) {
    expect(html).toContain(`href="/${c}/"`);
    expect(html).toContain(`href="/talents/${c}/"`);
  }
  expect(html).toContain('Warrior Talent Calculator for WoW Forever');
});

test('sitemap excludes noindex pages; robots.txt references sitemap', async ({ request }) => {
  const sitemap = await (await request.get('/sitemap-0.xml')).text();
  expect(sitemap).toContain('/mage/');
  expect(sitemap).not.toContain('/compare/');
  expect(sitemap).not.toContain('/my-builds/');
  // All 18 class pages (9 calculators + 9 references) are listed.
  const classes = ['warrior', 'paladin', 'hunter', 'rogue', 'priest', 'shaman', 'mage', 'warlock', 'druid'];
  for (const c of classes) {
    expect(sitemap).toContain(`/${c}/</loc>`);
    expect(sitemap).toContain(`/talents/${c}/</loc>`);
  }

  // Plain /sitemap.xml exists alongside the integration's sitemap-index.xml.
  const plain = await (await request.get('/sitemap.xml')).text();
  expect(plain).toContain('<urlset');
  expect(plain).toContain('/mage/');
  expect(plain).not.toContain('/compare/');
  expect(plain).not.toContain('/my-builds/');

  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Sitemap: https://wowforevertalentcalculator.com/sitemap.xml');
  expect(robots).toContain('Sitemap: https://wowforevertalentcalculator.com/sitemap-index.xml');
});

test('beta end and changelog pages are live, canonical, and in the sitemaps', async ({
  request,
}) => {
  for (const path of ['/wow-forever-beta-end/', '/changelog/']) {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    const html = await res.text();
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
    expect(canonical).toBe(`https://wowforevertalentcalculator.com${path}`);
  }

  const plain = await (await request.get('/sitemap.xml')).text();
  const integration = await (await request.get('/sitemap-0.xml')).text();
  for (const path of ['/wow-forever-beta-end/', '/changelog/']) {
    expect(plain).toContain(`${path}</loc>`);
    expect(integration).toContain(`${path}</loc>`);
  }
  const betaLastmod = /<loc>[^<]*\/wow-forever-beta-end\/<\/loc><lastmod>([^<]+)<\/lastmod>/.exec(
    plain,
  )?.[1];
  expect(betaLastmod).toBe('2026-10-18');
});

test('beta end page carries FAQPage JSON-LD and a no-JS countdown fallback', async ({
  request,
}) => {
  const html = await (await request.get('/wow-forever-beta-end/')).text();
  const title = 'WoW Forever Beta End Date & Stress Test (Closed): Oct 21 & Nov 4';
  const description =
    'The WoW Forever stress test window is closed. Blizzard held it on Oct 21 for North America and Europe and on Oct 22 for Korea and Taiwan. It was free for everyone. Published start times, how players joined, beta end on Oct 21, and the Nov 4 launch.';
  expect(unescapeEntities(/<title>([^<]+)<\/title>/.exec(html)?.[1] ?? '')).toBe(title);
  expect(unescapeEntities(/<meta property="og:title" content="([^"]+)"/.exec(html)?.[1] ?? '')).toBe(title);
  expect(unescapeEntities(/<meta name="twitter:title" content="([^"]+)"/.exec(html)?.[1] ?? '')).toBe(title);
  expect(html).toContain(`<meta name="description" content="${description}"`);
  expect(html).toContain(`<meta property="og:description" content="${description}"`);
  expect(html).toContain(`<meta name="twitter:description" content="${description}"`);
  const stressHeading = unescapeEntities(
    /<h2 id="stress-test">([^<]+)<\/h2>/.exec(html)?.[1] ?? '',
  );
  expect(stressHeading).toBe(
    'WoW Forever Stress Test: Start Times, Duration, and How Players Joined',
  );
  expect(html).toContain(
    'Blizzard moved the test from October 19 to October 21 on October 16.',
  );
  expect(html).toContain('October 21, 2:00 p.m. PDT');
  expect(html).toContain('October 21, 19:00 CEST');
  expect(html).toContain('October 22, 06:00 KST');
  expect(html).toContain('October 22, 05:00 CST');
  expect(html).toContain(
    'Blizzard said the beta would be taken offline shortly before the Stress Test and was expected to return shortly after.',
  );
  expect(html).toContain('The stress test window is closed.');
  expect(html).toContain('How players joined');
  expect(html.match(/October 19/g)).toHaveLength(1);
  expect(html).not.toContain('a few hours');

  const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
  const blocks = scripts.map((m) => JSON.parse(m[1]) as { '@type': string });
  const faqs = blocks.filter((b) => b['@type'] === 'FAQPage') as Array<{
    mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }>;
  }>;
  expect(faqs).toHaveLength(1);
  const questions = faqs[0].mainEntity;
  expect(questions).toHaveLength(8);
  const byName = new Map(questions.map((q) => [q.name, q.acceptedAnswer.text]));
  expect(byName.get('How long was the WoW Forever stress test?')).toBe(
    'Blizzard gave no end time. The test ran for a limited time and could end earlier or run later as needed. The window is closed.',
  );
  expect(byName.get('Was the WoW Forever stress test free?')).toBe(
    'Yes. Anyone could take part. No subscription, Game Time, invitation or beta access was required.',
  );
  expect(byName.get('How did players join the WoW Forever stress test?')).toBe(
    'The window is closed. Players opened the Battle.net app, selected World of Warcraft, then in the Game Version menu chose World of Warcraft: Forever Stress Test under In Development, selected Install, and selected Play when the test began.',
  );
  for (const question of questions) {
    expect(html).toContain(question.name);
    expect(html).toContain(question.acceptedAnswer.text);
  }
  // Static countdown fallback is present in the HTML (no JS required).
  expect(html).toContain('data-countdown-target="2026-11-04T23:00:00Z"');
  expect(html).toContain('October 21, 2026 (PST)');
});

test('unknown route returns real 404', async ({ request }) => {
  const res = await request.get('/unknown-class/');
  expect(res.status()).toBe(404);
});

test('JS disabled: reference and calculator pages stay readable', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.goto('/talents/mage/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('body')).toContainText('Wand Specialization');
  // Build 70291 has effect text on every mage rank, labeled with its evidence status.
  await expect(page.locator('body')).toContainText('Community record');
  await expect(page.locator('body')).toContainText('ranks have confirmed effect text');

  await page.goto('/mage/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Mage/);
  // Static class/change content readable without JS.
  await expect(page.locator('body')).toContainText(/Arcane/);
  await context.close();
});

test('footer carries the fan-made disclaimer; sources page carries CC BY attribution', async ({
  request,
}) => {
  const home = (await (await request.get('/')).text()).replace(/\s+/g, ' ');
  expect(home).toContain('Not affiliated with or endorsed by Blizzard Entertainment');

  const sources = (await (await request.get('/sources/')).text()).replace(/\s+/g, ' ');
  expect(sources).toContain('talentsforever.com');
  expect(sources).toContain('CC BY 4.0');
});
