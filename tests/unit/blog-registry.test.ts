import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOG_POSTS, postPath } from '../../src/data/blog';

const root = path.resolve(__dirname, '../..');

describe('blog registry', () => {
  it('has at least four posts with unique slugs', () => {
    expect(BLOG_POSTS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(BLOG_POSTS.map((p) => p.slug)).size).toBe(BLOG_POSTS.length);
  });

  it.each(BLOG_POSTS.map((p) => [p.slug, p] as const))(
    '%s has valid metadata and a page file',
    (slug, post) => {
      expect(post.description.length).toBeGreaterThan(60);
      expect(post.description.length).toBeLessThanOrEqual(160);
      expect(post.title.length).toBeLessThanOrEqual(70);
      expect(post.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(post.dateModified >= post.datePublished).toBe(true);
      expect(postPath(slug)).toBe(`/blog/${slug}/`);
      expect(
        existsSync(path.join(root, 'src/pages/blog', slug, 'index.astro')),
      ).toBe(true);
    },
  );
});
