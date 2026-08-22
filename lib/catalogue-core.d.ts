export const NASA_COLUMNS: string[];
export const NASA_SOURCE_URL: string;
export function compileCatalogue(
  rows: Record<string, unknown>[],
  options?: { retrievedUtc?: string; sourceSha256?: string | null },
): { catalogue: Record<string, unknown>; searchIndex: Record<string, unknown> };
