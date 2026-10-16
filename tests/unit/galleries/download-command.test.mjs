import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { downloadCommand } from "../../../src/features/galleries/volume-em/download-command.mjs";

test("download command keeps every supplied character inside a quoted shell argument", () => {
    const value = 'https://example.org/bioimaging-01-pub/image%27%24%28probe%29%3B.zarr';
    assert.equal(downloadCommand(value), `aws s3 cp --no-sign-request --endpoint-url 'https://example.org' 's3://bioimaging-01-pub/image'"'"'$(probe);.zarr' './image'"'"'$(probe);.zarr' --recursive`);
    assert.equal(downloadCommand('https://example.org/bioimaging-01-pub/-recursive.zarr'), `aws s3 cp --no-sign-request --endpoint-url 'https://example.org' 's3://bioimaging-01-pub/-recursive.zarr' './-recursive.zarr' --recursive`);
    for (const value of ['javascript:probe', 'https://name:password@example.org/bucket/image.zarr', 'http://127.0.0.1/bucket/image.zarr', 'https://example.org/bucket', 'https://example.org/bucket/image.zarr?signature=private', 'https://example.org/bucket/image%0A.zarr', 'https://example.org/bucket/%ZZ.zarr', 'https://example.org/bucket///']) assert.equal(downloadCommand(value), null, value);
    assert.equal(downloadCommand('https://example.org/bucket/prefix/%2e%2e%2fimage.zarr'), null);
    assert.equal(downloadCommand('https://example.org/bucket/prefix%5cimage.zarr'), null);
});

test('EBI bucket-host and path-style URLs address the same bucket, prefix and endpoint', () => {
    for (const path of ['phase1test/image.zarr', 'phase1test/image.zarr/']) {
        const expected = `aws s3 cp --no-sign-request --endpoint-url 'https://livingobjects.ebi.ac.uk' 's3://bioimaging-01-pub/${path}' './image.zarr' --recursive`;
        for (const host of ['bioimaging-01-pub.livingobjects.ebi.ac.uk', 'bioimaging-01-pub.livingobjects.ebi.ac.uk.']) {
            assert.equal(downloadCommand(`https://${host}/${path}`), expected);
        }
        assert.equal(downloadCommand(`https://livingobjects.ebi.ac.uk/bioimaging-01-pub/${path}`), expected);
    }
    assert.equal(downloadCommand('https://bioimaging-01-pub.livingobjects.ebi.ac.uk/image.zarr'),
        "aws s3 cp --no-sign-request --endpoint-url 'https://livingobjects.ebi.ac.uk' 's3://bioimaging-01-pub/image.zarr' './image.zarr' --recursive");
    for (const value of ['https://bioimaging-01-pub.livingobjects.ebi.ac.uk/', 'https://bioimaging-01-pub.livingobjects.ebi.ac.uk/?prefix=private']) assert.equal(downloadCommand(value), null);
    assert(downloadCommand('https://bucket.livingobjects.ebi.ac.uk.example.org/bucket/image.zarr').includes("--endpoint-url 'https://bucket.livingobjects.ebi.ac.uk.example.org'"));
});

test('object keys retain repeated and encoded slashes, spaces and prefix terminators', () => {
    for (const path of ['/prefix/image.zarr/', 'prefix//image.zarr/', 'prefix%2F%2Fimage.zarr/', 'prefix//image%20with%20spaces.zarr/']) {
        const key = decodeURIComponent(path);
        const name = key.split('/').filter(Boolean).at(-1);
        assert.equal(downloadCommand(`https://livingobjects.ebi.ac.uk/bioimaging-01-pub/${path}`),
            `aws s3 cp --no-sign-request --endpoint-url 'https://livingobjects.ebi.ac.uk' 's3://bioimaging-01-pub/${key}' './${name}' --recursive`);
    }
});

test('every curated volume-EM command retains its known EBI bucket and full source key', async () => {
    const images = JSON.parse(await readFile(new URL('../../../src/data/collections/vem_image_summaries.json', import.meta.url)));
    for (const image of Object.values(images)) {
        const uri = new URL(image.ome_zarr_image_uri);
        const bucket = uri.hostname === 'livingobjects.ebi.ac.uk'
            ? ['bioimaging-01-pub', 'bioimaging-integrator-data', 'bioimaging-sandbox'].find(value => uri.pathname.startsWith(`/${value}/`))
            : 'bioimaging-01-pub';
        assert(bucket);
        const prefix = uri.hostname === 'livingobjects.ebi.ac.uk' ? `/${bucket}/` : '/';
        assert(['livingobjects.ebi.ac.uk', 'bioimaging-01-pub.livingobjects.ebi.ac.uk'].includes(uri.hostname));
        assert(uri.pathname.startsWith(prefix));
        const key = decodeURIComponent(uri.pathname.slice(prefix.length));
        const command = downloadCommand(uri.href);
        assert(command.includes("--endpoint-url 'https://livingobjects.ebi.ac.uk'"));
        assert(command.includes(`'s3://${bucket}/${key}'`));
    }
});
