/** Display credit for the published beta client build. Oct 8 is the build date. */
export const TALENTSFOREVER_URL = 'https://talentsforever.com/';
export const CC_BY_4_0_URL = 'https://creativecommons.org/licenses/by/4.0/';

export function dataBuildLine(gameBuild: string | null | undefined): string | null {
  if (gameBuild === '70291') return 'Data: beta build 70291 (Oct 8, 2026)';
  return null;
}
