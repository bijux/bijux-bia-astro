import { execFile } from 'node:child_process';
import { cp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { prepareArtifacts } from '../../../scripts/build/artifacts.mjs';
import { packageDeployment, deploymentPackagePath } from '../../../scripts/deployment/package.mjs';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const output = path.join(repository, 'artifacts/website-verification');
export const runtimeRoot = deploymentPackagePath(path.join(output, 'application'));

/** Assemble the same files as the container, with an independent production install. */
export async function prepareRuntime(buildRoot) {
    await packageDeployment(buildRoot);
    await cp(path.join(buildRoot, 'package-lock.json'), path.join(runtimeRoot, 'package-lock.json'));
    const args = ['ci', '--omit=dev', '--ignore-scripts', '--offline', '--no-audit', '--no-fund',
        '--cache', path.join(repository, 'artifacts/npm-cache')];
    const started = performance.now();
    const env = { ...process.env, NODE_OPTIONS: "" };
    delete env.NODE_PATH;
    let result;
    try {
        result = await promisify(execFile)('npm', args, {
            cwd: runtimeRoot, env, timeout: 120000, killSignal: 'SIGKILL', maxBuffer: 2 * 1024 * 1024,
        });
    } catch (error) {
        await writeFile(path.join(output, 'runtime-install.log'), (error.stdout ?? '') + (error.stderr ?? ''));
        throw error;
    }
    await writeFile(path.join(output, 'runtime-install.log'), result.stdout + result.stderr);
    await prepareArtifacts(runtimeRoot);
    const manifest = JSON.parse(await readFile(path.join(runtimeRoot, 'package.json'), 'utf8'));
    const dependencies = Object.fromEntries(await Promise.all(Object.keys(manifest.dependencies).map(async name =>
        [name, JSON.parse(await readFile(path.join(runtimeRoot, 'node_modules', name, 'package.json'), 'utf8')).version])));
    const reportPath = path.join(output, 'report.json');
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    report.runtime = { node: process.version, install: args.slice(0, 6), installMs: Math.round(performance.now() - started), dependencies,
        moduleBoundary: 'Reject filesystem modules outside the production package, except the explicit fixture transport.' };
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
}
