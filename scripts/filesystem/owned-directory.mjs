import { lstat, mkdir } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

/** Create output beneath a trusted root, rejecting links and non-directory ancestors. */
export async function ownedDirectory(root, name) {
    if (typeof name !== 'string' || !name || isAbsolute(name) || /[\\\0]/.test(name) ||
        name.split('/').some(part => !part || part === '.' || part === '..')) {
        throw new TypeError('Output directory must be a relative path beneath its root.');
    }
    let directory = resolve(root);
    if (!(await lstat(directory)).isDirectory()) throw new Error('Output root must be a real directory.');
    // The checkout is trusted; callers must not allow concurrent replacement of its directories.
    for (const part of name.split('/')) {
        directory = resolve(directory, part);
        await mkdir(directory, { mode: 0o700 }).catch(error => {
            if (error.code !== 'EEXIST') throw error;
        });
        if (!(await lstat(directory)).isDirectory()) throw new Error('Output storage must be a real directory.');
    }
    return directory;
}
