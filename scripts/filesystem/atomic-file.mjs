import { randomUUID } from 'node:crypto';
import { lstat, open, rename, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

/** Publish in a validated owned directory, replacing destination links rather than following them. */
export async function writeFileAtomically(path, value) {
  const parent = await lstat(dirname(path));
  if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error('Output parent must be a real directory.');
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
