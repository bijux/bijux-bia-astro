import type { SearchHits } from '../types.ts';

function parseAccession(id: unknown): [string, number] {
  const match = String(id ?? "").match(/^([A-Z\-]+)(\d+)$/i);
  if (!match) return [String(id ?? ""), 0];
  return [match[1], parseInt(match[2], 10)];
}

function sortAccession(aId: unknown, bId: unknown, sortOrder: string) {
  const [aPrefix, aNum] = parseAccession(aId);
  const [bPrefix, bNum] = parseAccession(bId);
  const prefixCompare = aPrefix.localeCompare(bPrefix);
  if (prefixCompare !== 0) return sortOrder === "desc" ? -prefixCompare : prefixCompare;
  return sortOrder === "desc" ? bNum - aNum : aNum - bNum;
}

function sortReleaseDate(aReleaseDate: unknown, bReleaseDate: unknown, sortOrder: string) {
  const aTime = new Date(String(aReleaseDate ?? "")).getTime() || 0;
  const bTime = new Date(String(bReleaseDate ?? "")).getTime() || 0;
  return sortOrder === "desc" ? bTime - aTime : aTime - bTime;
}

/** Sorting never mutates the supplied response or its hit objects. */
export function sortedSearchResults(results: SearchHits['hits'] | undefined, sortBy: string, sortOrder: string, releaseDateSortField: string) {
    if (Array.isArray(results)) {
      switch(sortBy) {
        case "accession_id":
          results = results.slice().sort((a, b) => sortAccession(a?._source?.accession_id, b?._source?.accession_id, sortOrder));
          break;
        case "release_date":
        case "study_release_date":
          results = results.slice().sort((a, b) => sortReleaseDate(a?._source?.[releaseDateSortField], b?._source?.[releaseDateSortField], sortOrder));
          break;
        default:
          results = results.slice();
          break;
      }
    }
    return results;
}
