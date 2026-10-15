import { buildFacetOptions, isNumericFacet } from './facet-options.mjs';
import type { FacetData, FacetView, SelectedFacets, SearchScope } from './types.ts';

type FacetConfig =
  | { title: string; type: 'terms' | 'boolean'; queryKey: string }
  | { title: string; type: 'range' | 'slider'; field: string };

const FACET_CONFIG: Record<string, FacetConfig> = {
  scientific_name: { title: "Organism", type: "terms", queryKey: "facet.organism" },
  imaging_method: { title: "Imaging Method", type: "terms", queryKey: "facet.imaging_method" },
  release_date: { title: "Release Year", type: "terms", queryKey: "facet.year" },
  annotation_method: { title: "Annotation Method", type: "terms", queryKey: "facet.annotation_method" },
  image_format: { title: "Image Format", type: "terms", queryKey: "facet.image_format" },
  number_of_channels: { title: "Channels", type: "terms", queryKey: "size_c" },
  licence: {title: "Licence", type:"terms", queryKey: "facet.licence"},
  file_type: { title: "File Type", type: "terms", queryKey: "facet.file_type" },

  image_pixel_z: { title: "Z-Planes", type: "terms", queryKey: "size_z" },
  image_pixel_x: { title: "Image Pixel X (px)", type: "terms", queryKey: "size_x" },
  image_pixel_y: { title: "Image Pixel Y (px)", type: "terms", queryKey: "size_y" },
  time_steps: { title: "Time Steps", type: "terms", queryKey: "size_t" },
  total_size_in_bytes: { title: "Total Size (bytes)", type: "terms", queryKey: "total_size_in_bytes" },
  total_physical_size_x: { title: "Total Physical Size X (m)", type: "terms", queryKey: "total_physical_size_x" },
  total_physical_size_y: { title: "Total Physical Size Y (m)", type: "terms", queryKey: "total_physical_size_y" },
  total_physical_size_z: { title: "Total Physical Size Z (m)", type: "terms", queryKey: "total_physical_size_z" },
  voxel_physical_size_x: { title: "Voxel Physical Size X (m/px)", type: "terms", queryKey: "voxel_physical_size_x" },
  voxel_physical_size_y: { title: "Voxel Physical Size Y (m/px)", type: "terms", queryKey: "voxel_physical_size_y" },
  voxel_physical_size_z: { title: "Voxel Physical Size Z (m/px)", type: "terms", queryKey: "voxel_physical_size_z" },
};

function hasBuckets(x: unknown): x is FacetData {
  return !!x && typeof x === 'object' && 'buckets' in x && Array.isArray(x.buckets) &&
    x.buckets.every(bucket => bucket && ['string', 'number'].includes(typeof bucket.key) && Number.isSafeInteger(bucket.doc_count) && bucket.doc_count >= 0 && (bucket.key_as_string == null || typeof bucket.key_as_string === 'string')) &&
    (!('sum_other_doc_count' in x) || Number.isSafeInteger(x.sum_other_doc_count) && Number(x.sum_other_doc_count) >= 0);
}

function hasMinMax(x: unknown): x is { min?: number; max?: number; globalMin: number; globalMax: number; globalCount?: number } {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const data = x as Record<string, unknown>;
  return ['globalMin', 'globalMax'].every(key => typeof data[key] === 'number' && Number.isFinite(data[key])) &&
    ['min', 'max', 'globalCount'].every(key => data[key] === undefined || typeof data[key] === 'number' && Number.isFinite(data[key]));
}


export function searchFacets(facetData: Record<string, unknown>, selectedFacets: SelectedFacets, searchType: SearchScope) {
    const facetEntries = Object.entries(facetData);
    // Restore omitted numeric groups only for the endpoint that offers them.
    for (const [facetKey, cfg] of Object.entries(FACET_CONFIG)) {
        if (!("queryKey" in cfg)) continue;
        const key = cfg.queryKey;
        const supportsNumericGroup = isNumericFacet(key) &&
          (searchType === "study" ? key === "facet.year" : key !== "facet.year");
        if (supportsNumericGroup && selectedFacets[key]?.length && !(facetKey in facetData)) {
          facetEntries.push([facetKey, { buckets: [], sum_other_doc_count: 0 }]);
        }
    }

    const facets: Record<string, FacetView> = {};
    for (const [facetKey, data] of facetEntries) {
      const cfg = FACET_CONFIG[facetKey];
      if (!cfg) continue;

      // TERMS FACETS (buckets)
      if ("queryKey" in cfg) {
        if (!hasBuckets(data)) throw new TypeError(`Invalid ${facetKey} facet buckets.`);

        const selectedValue = selectedFacets[cfg.queryKey] ?? [];
        const options = buildFacetOptions(data.buckets, cfg.queryKey, selectedValue);
        const returnedOptionCount = options.filter(option => option.count !== null).length;
        const totalFacetCounts = returnedOptionCount + (data.sum_other_doc_count ?? 0);

        facets[cfg.queryKey] = {
          kind: cfg.type,
          options,
          selectedValue,
          totalFacetCounts,
          title: cfg.title,
        };

        continue;
      }

      // RANGE FACETS (min/max)
      if (cfg.type === "range" || cfg.type === "slider") {
        if (!hasMinMax(data)) throw new TypeError(`Invalid ${facetKey} facet bounds.`);

        const gteKey = `${cfg.field}.gte`;
        const lteKey = `${cfg.field}.lte`;

        facets[cfg.field] = {
          kind: cfg.type,
          title: cfg.title,
          field: cfg.field,
          min: data.min,
          max: data.max,
          globalMin: data.globalMin,
          globalMax: data.globalMax,
          globalCount: data.globalCount,
          selectedMin: selectedFacets[gteKey]?.[0] ?? "",
          selectedMax: selectedFacets[lteKey]?.[0] ?? "",
          gteKey,
          lteKey,
        };

        continue;
      }

    }
    return facets;
}
