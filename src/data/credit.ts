/**
 * Display copy about where the talent data comes from, derived from the
 * published manifest so it never has to be edited by hand for a new build.
 */
import type { DatasetManifest } from '@domain/talents/types';

export const TALENTSFOREVER_URL = 'https://talentsforever.com/';
export const CC_BY_4_0_URL = 'https://creativecommons.org/licenses/by/4.0/';

const SHORT_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "2026-10-19" → "Oct 19, 2026" */
export function shortDate(iso: string): string {
  return SHORT_DATE.format(new Date(`${iso}T00:00:00Z`));
}

type StampManifest = Pick<
  DatasetManifest,
  'gameBuild' | 'publishedAt' | 'checkedAt' | 'sources'
>;

/** Upstream export date: the source record's date, else our publish date. */
export function upstreamExportDate(manifest: StampManifest): string {
  return manifest.sources[0]?.recordedAt ?? manifest.publishedAt;
}

/**
 * "Data: beta build 70425 · upstream export Oct 19, 2026 · checked Oct 20,
 * 2026 · community export, not verified in-game". Null when the manifest has
 * no game build to name.
 */
export function dataBuildLine(manifest: StampManifest): string | null {
  if (!manifest.gameBuild) return null;
  const checked = manifest.checkedAt ?? manifest.publishedAt;
  return [
    `Data: beta build ${manifest.gameBuild}`,
    `upstream export ${shortDate(upstreamExportDate(manifest))}`,
    `checked ${shortDate(checked)}`,
    'community export, not verified in-game',
  ].join(' · ');
}

/** "1,313 of 1,313 ranks have recorded effect text" (numbers from the data). */
export function rankCoverageLine(withText: number, total: number): string {
  const n = (v: number) => v.toLocaleString('en-US');
  if (total > 0 && withText === total) {
    return `${n(withText)} of ${n(total)} ranks have recorded effect text`;
  }
  const missing = total - withText;
  return `${n(withText)} of ${n(total)} ranks have recorded effect text; ${n(missing)} ${
    missing === 1 ? 'rank has' : 'ranks have'
  } none yet`;
}

/**
 * What the evidence labels mean for the current snapshot, in one honest
 * sentence. "Recorded" is the source's record, not an in-game check.
 */
export function provenanceSentence(): string {
  return (
    'The text comes from a community export (Talents Forever, CC BY 4.0) of ' +
    'the beta client files and has not been verified in-game by this site.'
  );
}
