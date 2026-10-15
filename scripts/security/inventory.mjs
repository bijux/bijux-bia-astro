import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { readdir, lstat, open } from 'node:fs/promises';
import { resolve, relative, extname, isAbsolute } from 'node:path';

export const codeExtensions = new Set(['.astro', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx']);
const generated = new Set(['node_modules', '.git', '.astro', '.netlify', 'dist', 'coverage', 'artifacts']);
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const slash = value => value.replaceAll('\\', '/');

/** Inventory the checkout, including untracked inputs. Generated exclusions apply only at the root. */
export async function inventory(root) {
  const code = [], other = [], excluded = [], errors = [];
  async function walk(path, required = false) {
    const name = slash(relative(root, path));
    let stat;
    try { stat = await lstat(path); }
    catch (error) {
      if (required || error.code !== 'ENOENT') errors.push(`${name}: ${error.code}`);
      return;
    }
    if (stat.isSymbolicLink()) { errors.push(`Symlink input rejected: ${name}`); return; }
    if (required && !stat.isDirectory()) { errors.push(`Required source directory is not a directory: ${name}`); return; }
    if (stat.isDirectory()) {
      if (generated.has(name)) { excluded.push(name); return; }
      for (const entry of (await readdir(path)).sort()) await walk(resolve(path, entry));
    } else if (stat.isFile()) {
      (codeExtensions.has(extname(path)) ? code : other).push(name);
    } else {
      errors.push(`Non-regular input rejected: ${name}`);
    }
  }
  await walk(resolve(root, 'src'), true);
  for (const name of (await readdir(root)).sort()) {
    if (generated.has(name)) { excluded.push(name); continue; }
    if (name !== 'src') await walk(resolve(root, name));
  }
  return { code: [...new Set(code)].sort(), other: other.sort(), excluded: excluded.sort(), errors };
}

/** Bound reads and verify the descriptor identifies the regular file we inspected. */
export async function inputBytes(root, name, maxBytes = 32 * 1024 * 1024) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError('Invalid input size limit.');
  if (typeof name !== 'string' || !name || isAbsolute(name) || name.includes('\0') || name.includes('\\') || name.split('/').some(part => !part || part === '..' || part === '.')) throw new Error('Invalid repository input path.');
  const parts = name.split('/');
  let path = resolve(root);
  let before;
  for (const [index, part] of parts.entries()) {
    path = resolve(path, part);
    before = await lstat(path);
    if (before.isSymbolicLink() || (index < parts.length - 1 ? !before.isDirectory() : !before.isFile())) throw new Error(`Non-regular or symlink input rejected: ${name}`);
  }
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino || stat.size > maxBytes) throw new Error(`Unsafe or oversized input: ${name}`);
    const buffer = Buffer.alloc(Math.min(stat.size + 1, maxBytes + 1));
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    const after = await file.stat();
    const current = await lstat(path);
    if (offset !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs || current.isSymbolicLink() || current.dev !== stat.dev || current.ino !== stat.ino) throw new Error(`Input changed during read: ${name}`);
    return buffer.subarray(0, offset);
  } finally {
    await file.close();
  }
}

export async function fileHashes(root, names) {
  const hashes = {};
  // Avoid exhausting descriptors when several analyzers/test suites run together.
  for (let start = 0; start < names.length; start += 16) {
    await Promise.all(names.slice(start, start + 16).map(async name => { hashes[name] = sha256(await inputBytes(root, name)); }));
  }
  return Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b)));
}
