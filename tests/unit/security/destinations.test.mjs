import assert from "node:assert/strict";
import test from "node:test";
import { navigationURL, resourceURL } from "../../../src/security/urls.mjs";
import { scriptData } from "../../../src/security/html.mjs";
import { metadataColour } from "../../../src/security/styles.mjs";
import { imageSizeMicrometres } from "../../../src/features/galleries/ai/image-dimensions.mjs";

test("navigation preserves page-local links and rejects executable/credentialed destinations", () => {
    for (const value of ["javascript:alert(1)", "data:text/html,probe", "//elsewhere.example/path", "https://name:password@example.org/", "https://example.org/\nprobe", "https:\\example.org/"]) assert.equal(navigationURL(value), null, value);
    for (const value of ["#annotation-type", "?query=mouse"]) assert.equal(navigationURL(value), value);
    const relative = new URL(navigationURL("/bioimage-archive/studies?query=µ#results"), "https://example.org");
    assert.equal(relative.searchParams.get("query"), "µ");
    assert.equal(relative.hash, "#results");
    assert.equal(navigationURL("https://example.org/µ"), "https://example.org/%C2%B5");
    const legacy = Object.freeze(["https://example.org/image.zarr"]);
    assert.equal(resourceURL(legacy), legacy[0]);
    assert.equal(navigationURL(["javascript:probe"]), null);
    assert.equal(navigationURL(["https://example.org/a", "https://example.org/b"]), null);
    assert.equal(navigationURL("https:example.org"), null);
    assert.equal(navigationURL('#"<probe>'), '#%22%3Cprobe%3E');
});

test("local resource access requires an explicit mode, including normalized IP aliases", () => {
    for (const host of ["localhost", "LOCALHOST.", "scanner.local", "scanner", "127.1", "2130706433", "0x7f000001", "10.2.3.4", "172.31.2.3", "192.168.1.1", "100.64.0.1", "[::1]", "[::ffff:127.0.0.1]", "[fd00::1]", "[fe80::1]"]) {
        const value = `http://${host}/volume.zarr`;
        assert.equal(resourceURL(value), null, value);
        assert(resourceURL(value, { allowLocal: true }), value);
    }
    assert.equal(resourceURL("https://example.org/volume.zarr"), "https://example.org/volume.zarr");
    assert.equal(resourceURL("https://192.0.5.1/volume.zarr"), "https://192.0.5.1/volume.zarr");
    assert.equal(resourceURL("https://[2606:4700:4700::1111]/volume.zarr"), "https://[2606:4700:4700::1111]/volume.zarr");
    assert.equal(resourceURL("/volume.zarr"), null);
});

test("script data round-trips scientific text without exposing raw-text element terminators", () => {
    const value = { text: '</ScRiPt><img onerror="probe"> µ | &\u2028\u2029', zero: 0, closed: false };
    const encoded = scriptData(value);
    assert.deepEqual(JSON.parse(encoded), value);
    assert.doesNotMatch(encoded, /[<>&\u2028\u2029]/);
    assert.throws(() => scriptData(undefined), TypeError);
});

test("annotation colours cannot introduce CSS declarations, functions or external requests", () => {
    for (const value of ["#ff0055", "RebeccaPurple", "rgb(255, 0, 12)", "hsl(120 50% 30% / .5)"]) assert.equal(metadataColour(value), value);
    for (const value of ["red; background: url(https://blocked.invalid/probe)", "url(http://127.0.0.1/)", "expression(probe)", "rgb(1,2,3); color:red", null, {}, "x".repeat(129)]) assert.equal(metadataColour(value), "transparent");
});

test("image extents multiply pixel counts by voxel pitch and distinguish zero from missing", () => {
    assert.deepEqual(imageSizeMicrometres({size_x:100,size_y:200,voxel_physical_size_x:1e-6,voxel_physical_size_y:2e-6}), ['1.0e+2','4.0e+2']);
    assert.deepEqual(imageSizeMicrometres({size_x:0,size_y:10,voxel_physical_size_x:1e-6,voxel_physical_size_y:0}), ['0.0','0.0']);
    for (const value of [undefined, {}, {size_x:'100',voxel_physical_size_x:1e-6}, {size_x:Infinity,voxel_physical_size_x:1}, {size_x:-1,voxel_physical_size_x:1}]) assert.deepEqual(imageSizeMicrometres(value), ['Not reported','Not reported']);
});
