import { registerHooks } from 'node:module';
import { realpathSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = realpathSync(process.cwd());
const fixtures = realpathSync(fileURLToPath(new URL('../../fixtures/', import.meta.url)));
const preload = new URL('../../fixtures/website/preload.mjs', import.meta.url).href;
const entryParent = pathToFileURL(root + sep).href;
const inside = (directory, file) => {
    const value = relative(directory, file);
    return value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value);
};

// A nested fixture must not borrow packages from its development checkout.
// Hooks cover both ESM imports and CommonJS require, including transitive loads.
registerHooks({
    resolve(specifier, context, nextResolve) {
        const result = nextResolve(specifier, context);
        if (result.url.startsWith('node:') || result.url.startsWith('data:')) return result;
        const target = fileURLToPath(result.url);
        if (inside(root, target)) return result;
        const parent = context.parentURL?.startsWith('file:') ? fileURLToPath(context.parentURL) : null;
        // Only the explicitly preloaded fixture transport may live outside the package.
        if (inside(fixtures, target) && ((parent && inside(fixtures, parent)) ||
            (specifier === preload && context.parentURL === entryParent))) return result;
        throw new Error(`Production module escaped its package: ${specifier}`);
    },
});
