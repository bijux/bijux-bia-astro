import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { ownedDirectory } from '../../../scripts/filesystem/owned-directory.mjs';

const repository = fileURLToPath(new URL('../../../', import.meta.url));

/** An isolated Astro root; callers own teardown while build evidence remains outside it. */
export async function createAstroFixture(owner, sources = []) {
    if (!/^[a-z][a-z-]*$/.test(owner)) throw new TypeError('Fixture owner must be a descriptive slug.');
    const directory = await ownedDirectory(repository, `artifacts/testing/astro/${owner}`);
    const run = await mkdtemp(path.join(directory, 'run-'));
    const root = path.join(run, 'application');
    try {
        await mkdir(path.join(root, 'src/pages'), { recursive: true });
        for (const relative of sources) {
            if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new TypeError('Fixture sources must stay in the repository.');
            await cp(path.join(repository, relative), path.join(root, relative), {
                recursive: true, filter: source => source !== path.join(repository, 'src/pages'),
            });
        }
        await symlink(path.join(repository, 'node_modules'), path.join(root, 'node_modules'), 'dir');
        await writeFile(path.join(root, 'package.json'), '{"type":"module"}\n');
        return root;
    } catch (error) {
        await rm(run, { recursive: true, force: true });
        throw error;
    }
}

/** Compile real components with bounded execution, retaining logs for passing and failing builds. */
export async function buildAstroFixture(root, env = {}) {
    const started = performance.now();
    const evidence = path.join(path.dirname(root), `build-${randomUUID()}`);
    let result, failure;
    try {
        result = await promisify(execFile)(process.execPath,
            [path.join(repository, 'node_modules/astro/bin/astro.mjs'), 'build', '--root', root],
            { cwd: repository, timeout: 120000, killSignal: 'SIGKILL', maxBuffer: 2 * 1024 * 1024,
                env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', ...env } });
        return result;
    } catch (error) {
        failure = error;
        throw error;
    } finally {
        await writeFile(`${evidence}.log`, (result?.stdout ?? failure?.stdout ?? '') + (result?.stderr ?? failure?.stderr ?? ''));
        await writeFile(`${evidence}.json`, JSON.stringify({ milliseconds: performance.now() - started,
            exitCode: failure ? failure.code ?? null : 0, signal: failure?.signal ?? null }, null, 2) + '\n');
    }
}
