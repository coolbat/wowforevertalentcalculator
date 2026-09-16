/**
 * Site-wide motion layer, ported from the poojahooda22/motion-website
 * techniques (GSAP + ScrollTrigger):
 *
 * - Hero title: per-word rise-in on page load (its "texthead" effect).
 * - Section headings: per-word reveal when scrolled into view.
 * - Cards / steps / stats / FAQ items: staggered rise via ScrollTrigger.batch
 *   (its "cards" effect).
 *
 * Headings are split at word boundaries — never characters — so keyword
 * phrases ("WoW Forever Talent Calculator") survive element-wise text
 * extraction by SEO analyzers and crawlers. Progressive enhancement only:
 * every initial state is set from JS, so the pages stay fully readable with
 * JS disabled, and nothing runs under prefers-reduced-motion. The React
 * calculator island manages its own DOM and is deliberately not targeted.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Split an element's plain text into inline-block word spans (aria-safe). */
function splitWords(el: HTMLElement): HTMLSpanElement[] | null {
  // Only split plain-text headings — nested markup (links, strong) must survive.
  if (el.children.length > 0) return null;
  const text = el.textContent ?? '';
  if (!text.trim()) return null;
  el.setAttribute('aria-label', text);
  el.textContent = '';
  const words = text.split(/\s+/).filter(Boolean);
  const spans: HTMLSpanElement[] = [];
  words.forEach((word, i) => {
    const span = document.createElement('span');
    span.textContent = word;
    span.setAttribute('aria-hidden', 'true');
    span.style.display = 'inline-block';
    el.appendChild(span);
    spans.push(span);
    // Real text-node space between words: innerText and element-wise
    // extractors both see intact word boundaries.
    if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
  });
  return spans;
}

function initHero(): void {
  const h1 = document.querySelector<HTMLElement>('.hero h1');
  if (!h1) return;
  const words = splitWords(h1);
  if (words) {
    gsap.from(words, {
      y: 40,
      opacity: 0,
      duration: 0.7,
      ease: 'power4.out',
      stagger: 0.06,
    });
  }
  const lede = document.querySelector('.hero .lede');
  if (lede) {
    gsap.from(lede, { y: 24, opacity: 0, duration: 0.6, delay: 0.4, ease: 'power3.out' });
  }
  const badge = document.querySelector('.hero .stage-badge');
  if (badge) {
    gsap.from(badge, { y: 14, opacity: 0, duration: 0.5, delay: 0.6, ease: 'power3.out' });
  }
}

function initHeadingReveals(): void {
  // .hero-tool contains the React calculator island — splitting its tree-name
  // h2s before hydration would cause a hydration mismatch, so it is excluded.
  document.querySelectorAll<HTMLElement>('.page-section:not(.hero-tool) h2').forEach((h2) => {
    const words = splitWords(h2);
    if (!words) {
      gsap.from(h2, {
        y: 24,
        opacity: 0,
        duration: 0.5,
        ease: 'power3.out',
        scrollTrigger: { trigger: h2, start: 'top 88%', once: true },
      });
      return;
    }
    gsap.set(words, { opacity: 0, y: 22 });
    gsap.to(words, {
      opacity: 1,
      y: 0,
      duration: 0.5,
      ease: 'power3.out',
      stagger: 0.05,
      scrollTrigger: { trigger: h2, start: 'top 88%', once: true },
    });
  });
}

function initScrollRises(): void {
  const targets = document.querySelectorAll<HTMLElement>(
    '.steps li, .class-card, .panel, .stat-card, .faq-item',
  );
  if (targets.length === 0) return;
  gsap.set(targets, { opacity: 0, y: 28 });
  ScrollTrigger.batch(targets, {
    start: 'top 90%',
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, {
        opacity: 1,
        y: 0,
        duration: 0.55,
        ease: 'power3.out',
        stagger: 0.08,
        overwrite: true,
      }),
  });
}

if (!reducedMotion) {
  initHero();
  initHeadingReveals();
  initScrollRises();
}
