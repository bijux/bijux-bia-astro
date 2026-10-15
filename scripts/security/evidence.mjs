import { randomUUID } from 'node:crypto';
import { mkdir, lstat, open, rename, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

export async function ownedDirectory(root, name) {
  let path = root;
  for (const part of name.split('/')) {
    if (!part || part === '.' || part === '..') throw new Error('Invalid evidence directory.');
    path = resolve(path, part);
    await mkdir(path, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Evidence directory is not owned regular storage.');
  }
  return path;
}

/** Publish complete files atomically; never follow a pre-existing destination symlink. */
export async function saveEvidence(path, value) {
  const parent = await lstat(dirname(path));
  if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error('Invalid evidence parent.');
  const staged = resolve(dirname(path), `.publish-${process.pid}-${randomUUID()}`);
  const file = await open(staged, 'wx', 0o600);
  try {
    await file.writeFile(value);
    await file.close();
    await rename(staged, path);
  } finally {
    await file.close().catch(() => {});
    await rm(staged, { force: true });
  }
}
