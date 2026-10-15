import { readFileSync } from 'node:fs';
const rows = JSON.parse(readFileSync(new URL('../../../src/data/ai-dataset-benchmarking/model-dataset-table.json', import.meta.url)));

// Only names are synthetic; the finite dataset relationships come from authored model tables.
export const benchmarkStudies = new Map();
for (const row of rows) {
    if (!benchmarkStudies.has(row.study)) benchmarkStudies.set(row.study, { accession_id: row.study, dataset: [] });
    const datasets = benchmarkStudies.get(row.study).dataset;
    for (const uuid of [row.dataset_uuid, row.annotation_data_set_uuid].filter(Boolean)) {
        if (!datasets.some(dataset => dataset.uuid === uuid)) datasets.push({ uuid, title: `Fixture dataset ${uuid}` });
    }
}
