export type SearchScope = 'study' | 'image';
export type SelectedFacets = Record<string, string[]>;

export interface SearchHits {
  total: { value: number; relation?: string };
  max_score?: number | null;
  hits: { _source: Record<string, unknown>; highlight?: Record<string, string[]> }[];
}

export interface FacetData {
  buckets: { key: string | number; key_as_string?: string | null; doc_count: number }[];
  sum_other_doc_count?: number | null;
}

export interface FacetView {
  kind: 'terms' | 'boolean' | 'range' | 'slider';
  title: string;
  options?: { value: string; count: number | null }[];
  selectedValue?: string[];
  totalFacetCounts?: number;
  field?: string;
  min?: number | null;
  max?: number | null;
  globalMin?: number;
  globalMax?: number;
  globalCount?: number | null;
  selectedMin?: string;
  selectedMax?: string;
  gteKey?: string;
  lteKey?: string;
}

export interface PaginationData {
  page?: number;
  page_size: number;
  total_pages: number;
  next_cursor?: string | null;
}
