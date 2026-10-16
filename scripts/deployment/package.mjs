import { cp, lstat, realpath, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownedDirectory } from '../filesystem/owned-directory.mjs';
import { verifyDeployment } from './manifest.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
export const deploymentPackagePath = root => join(root, 'artifacts/runtime');

/** Package the server and sealed build together; dependencies are installed separately. */
export async function packageDeployment(root = repository) {
    await ownedDirectory(root, 'artifacts');
    await verifyDeployment(root);
    const physicalRoot = await realpath(root);
    const output = await ownedDirectory(root, 'artifacts/runtime');
    await rm(output, { recursive: true, force: true });
    await ownedDirectory(root, 'artifacts/runtime');
    for (const name of ['package.json', 'artifacts/dist', 'artifacts/deployment',
        'src/server', 'src/security/headers.mjs', 'src/observability']) {
        await cp(join(root, name), join(output, name), {
            recursive: true,
            filter: async source => {
                const entry = await lstat(source);
                const location = relative(physicalRoot, await realpath(source));
                if (location === '..' || location.startsWith(`..${sep}`) || isAbsolute(location)) throw new Error(`Runtime source resolves outside its build: ${source}`);
                if (!entry.isFile() && !entry.isDirectory()) throw new Error(`Runtime source must be a regular file or directory: ${source}`);
                return true;
            },
        });
    }
    await verifyDeployment(output);
    return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await packageDeployment();
