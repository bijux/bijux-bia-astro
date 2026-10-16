import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const curation = new URL('../../../../src/features/galleries/ai/benchmarking/curation/', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name, curation), 'utf8'));

test('curated evaluations resolve their model routes and study dataset associations', async () => {
    const [models, studies, evaluations] = await Promise.all(['models.json', 'studies.json', 'evaluations.json'].map(read));
    assert(evaluations.length > 0, 'Curated evaluations must not be empty.');
    for (const [key, model] of Object.entries(models)) assert.equal(model.nickname, key, `Model route identity: ${key}`);
    for (const [index, evaluation] of evaluations.entries()) {
        const context = `Evaluation ${index}: ${evaluation.model}/${evaluation.study}/${evaluation.dataset_uuid}`;
        assert(Object.hasOwn(models, evaluation.model), `${context}: unknown model`);
        assert(Object.hasOwn(studies, evaluation.study), `${context}: unknown study`);
        assert(studies[evaluation.study].dataset.some(dataset => dataset.uuid === evaluation.dataset_uuid), `${context}: dataset is not curated for this study`);
        assert(evaluation.analysis_parameters !== null && typeof evaluation.analysis_parameters === 'object' && !Array.isArray(evaluation.analysis_parameters), `${context}: analysis parameters must be a record`);
    }
});
