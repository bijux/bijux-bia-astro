import { lstat, mkdir, readlink, rename, rm, symlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownedDirectory } from '../filesystem/owned-directory.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const inspect = path => lstat(path).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
});

/** Keep standard tool entry points while storing generated files inside the checkout's artifacts. */
export async function prepareArtifacts(root = repository) {
    const artifacts = await ownedDirectory(root, 'artifacts');
    for (const [name, storage] of [['node_modules', 'node_modules'], ['.astro', 'astro'], ['.netlify', 'netlify']]) {
        const source = resolve(root, name);
        const target = resolve(artifacts, storage);
        const entry = await inspect(source);
        const existing = await inspect(target);
        if (existing && !existing.isDirectory()) throw new Error(`artifacts/${storage} must be a real directory.`);
        if (entry?.isSymbolicLink()) {
            if (resolve(dirname(source), await readlink(source)) !== target) throw new Error(`Unexpected ${name} link.`);
            await mkdir(target, { recursive: true });
        } else {
            if (entry && !entry.isDirectory()) throw new Error(`${name} must be a directory or its artifacts link.`);
            if (entry) {
                // npm may replace its entry link during installation; the completed install is authoritative.
                if (existing) await rm(target, { recursive: true });
                await rename(source, target);
            } else {
                await mkdir(target, { recursive: true });
            }
            await symlink(`artifacts/${storage}`, source, process.platform === 'win32' ? 'junction' : 'dir');
        }
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepareArtifacts();
