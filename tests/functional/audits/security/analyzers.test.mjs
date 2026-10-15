import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { run } from "../../../../scripts/security/execution.mjs";

const repository = fileURLToPath(new URL("../../../../", import.meta.url));

test("installed security analyzers cover Astro and browser scripts without hiding parser failures", async () => {
    const output = path.join(repository, "artifacts/security/analyzer-fixtures");
    await mkdir(output, { recursive: true });
    const root = await mkdtemp(path.join(output, "run-"));
    try {
        const result = await run(process.execPath,
            [path.join(repository, "scripts/security/scan-code.mjs"), path.join(root, "code.json")],
            { cwd: repository, timeout: 60000 });
        assert.equal(result.failure, null);
        assert.equal(result.signal, null);
        assert([0, 1].includes(result.code), result.stderr);
        const report = JSON.parse(await readFile(path.join(root, "code.json"), "utf8"));
        assert.equal(report.incomplete, false, JSON.stringify(report.errors));
        assert.deepEqual(report.errors, []);
        assert.equal(report.probes.length, 15);
        assert.deepEqual(report.probes.filter(probe => !probe.passed), []);
        assert(report.inventory.code.includes("src/features/search/HighlightedText.astro"));
        assert(report.inventory.code.includes("scripts/security/audit.mjs"));
        assert.equal(report.probes.find(probe => probe.name === "malformed-js").expectedRule, "PARSE_ERROR");
        assert.equal(report.probes.find(probe => probe.name === "astro-inline-client").expectedRule, "no-unsanitized/property");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
