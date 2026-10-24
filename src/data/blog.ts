/**
 * Blog post registry. Each post lives at src/pages/blog/<slug>/index.astro
 * and wraps its body in BlogPostLayout. Posts are hand-written Astro pages
 * (not Markdown) because several of them pull live numbers from the talent
 * snapshot at build time.
 */
export interface BlogPostMeta {
  slug: string;
  /** Page <title> and H1. */
  title: string;
  /** Meta description, 160 characters at most. */
  description: string;
  /** Short label shown on the index card. */
  kind: string;
  /** ISO date. Real creation date; never backdate. */
  datePublished: string;
  dateModified: string;
  /** Approximate reading time in minutes, rounded from the body word count. */
  readingMinutes: number;
}

export const BLOG_POSTS: BlogPostMeta[] = [
  {
    slug: 'how-to-use-the-wow-forever-talent-calculator',
    title: 'How to Use the WoW Forever Talent Calculator: Share, Save, Compare',
    description:
      'Walkthrough of the WoW Forever talent calculator: spending points, reading evidence badges, sharing a link, saving builds in your browser and comparing setups.',
    kind: 'Guide',
    datePublished: '2026-10-20',
    dateModified: '2026-10-20',
    readingMinutes: 6,
  },
  {
    slug: 'wow-forever-talent-points-levels-and-row-gates',
    title: 'WoW Forever Talent Points, Levels and Row Gates Explained',
    description:
      'How many talent points you have at each level in the calculator, how row gates work, and what a 51-point budget means for filling a whole tree in WoW Forever.',
    kind: 'Explainer',
    datePublished: '2026-10-20',
    dateModified: '2026-10-20',
    readingMinutes: 6,
  },
  {
    slug: 'where-wow-forever-talent-data-comes-from',
    title: 'Where WoW Forever Talent Data Comes From and How Far to Trust It',
    description:
      'The source, license and limits of this site\'s talent data: what a community record is, what has not been checked in game, and how to spot a stale rank text.',
    kind: 'Data notes',
    datePublished: '2026-10-20',
    dateModified: '2026-10-20',
    readingMinutes: 6,
  },
  {
    slug: 'wow-forever-beta-end-and-launch-talent-planning',
    title: 'WoW Forever Beta End and Nov 4 Launch: A Talent Planner\u2019s Timeline',
    description:
      'Blizzard\u2019s announced WoW Forever dates (stress test, beta end, name reservation, Nov 4 launch) and what they mean for planning talent builds in advance.',
    kind: 'Timeline',
    datePublished: '2026-10-20',
    dateModified: '2026-10-20',
    readingMinutes: 5,
  },
  {
    slug: 'wow-forever-druid-talent-trees-beta-data',
    title: 'WoW Forever Druid Talents: A Tree-by-Tree Look at the Beta Data',
    description:
      'The three Druid talent trees in the WoW Forever beta data: row layout, prerequisites, bottom-row talents and what changed from Classic. No tier lists.',
    kind: 'Class data',
    datePublished: '2026-10-20',
    dateModified: '2026-10-20',
    readingMinutes: 6,
  },
];

export function getPost(slug: string): BlogPostMeta {
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) throw new Error(`unknown blog post: ${slug}`);
  return post;
}

export function postPath(slug: string): string {
  return `/blog/${slug}/`;
}
