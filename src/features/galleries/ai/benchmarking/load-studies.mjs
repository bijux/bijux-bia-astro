import { boundedMap } from '../../../../api/http.mjs';

/** Both tables use one ordered lookup; duplicate studies share the page's request session. */
export async function loadDatasetNames(rows, client) {
    const studies = await boundedMap([...new Set(rows.map(row => row.study))], async accession => {
        const study = await client.getStudyFromApiByAccession(accession);
        if (!study) throw new Error(`Benchmarking study ${accession} is unavailable.`);
        return study;
    });
    return new Map(studies.flatMap(study => study.dataset.map(dataset => [dataset.uuid, dataset.title])));
}

/** Curated annotation references can name another study; resolve it before any table renders. */
export async function loadAnnotationStudies(study, datasets, client) {
    const accessions = [...new Set(datasets.map(dataset => dataset.annotation_study).filter(Boolean))]
        .filter(accession => accession !== study.accession_id);
    const related = await boundedMap(accessions, async accession => {
        const value = await client.getStudyFromApiByAccession(accession);
        if (!value) throw new Error(`Annotation study ${accession} is unavailable.`);
        return [accession, value];
    });
    return Object.fromEntries([[study.accession_id, study], ...related]);
}
