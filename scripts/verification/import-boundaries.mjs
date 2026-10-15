import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBuiltin } from 'node:module';
import ts from 'typescript';
import { parse } from '@astrojs/compiler';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const extensions = ['', '.mjs', '.js', '.ts', '.astro', '.json', '.css', '/index.mjs', '/index.ts'];
const serverOnly = specifier => isBuiltin(specifier) || specifier.startsWith('node:') || specifier === 'astro:env/server';

/** Verify ownership, runtime cycles and server-only dependencies reachable from browser scripts. */
export function boundaryIssues(graph, clients = []) {
    const issues = [], visited = new Set(), active = new Set();
    for (const [file, entry] of graph) {
        for (const target of entry.targets) {
            if (file.startsWith('src/features/') && file.endsWith('.astro') && target === 'src/api/client.mjs') issues.push(`${file}: presentation imports API client ${target}`);
            if (file.startsWith('src/server/') && target.startsWith('scripts/')) issues.push(`${file}: production runtime imports build tool ${target}`);
            if (file.startsWith('src/api/') && /^src\/(features|components|layouts|formatting)\//.test(target)) issues.push(`${file}: API imports presentation ${target}`);
            if (/^src\/(formatting|security)\//.test(file) && /^src\/(features|components|layouts|api)\//.test(target)) issues.push(`${file}: shared policy/formatting imports ${target}`);
            if (file.startsWith('src/components/ui/') && /^src\/(features|api|layouts)\//.test(target)) issues.push(`${file}: shared UI imports ${target}`);
        }
    }
    function walk(file, trail = []) {
        if (active.has(file)) { issues.push(`Runtime import cycle: ${[...trail, file].join(' -> ')}`); return; }
        if (visited.has(file)) return;
        active.add(file);
        for (const target of graph.get(file)?.targets ?? []) walk(target, [...trail, file]);
        active.delete(file); visited.add(file);
    }
    for (const file of graph.keys()) walk(file);
    const browser = new Set();
    function client(file) {
        if (browser.has(file)) return;
        browser.add(file);
        const entry = graph.get(file);
        for (const specifier of entry?.specifiers ?? []) if (serverOnly(specifier)) issues.push(`${file}: browser imports ${specifier}`);
        for (const target of entry?.targets ?? []) {
            if (target.startsWith('scripts/')) issues.push(`${file}: browser imports build/runtime tool ${target}`);
            client(target);
        }
    }
    for (const file of clients) client(file);
    return [...new Set(issues)].sort();
}

export async function inspectImports(root = repository) {
    const graph = new Map(), clients = [], issues = [];
    async function resolve(file, specifier) {
        if (!specifier.startsWith('.') && !specifier.startsWith('/src/')) return null;
        const modulePath = specifier.split(/[?#]/)[0];
        const base = modulePath.startsWith('/src/') ? modulePath.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(file), modulePath));
        if (base.startsWith('../') || path.isAbsolute(base)) { issues.push(`${file}: import escapes the repository ${specifier}`); return null; }
        for (const suffix of extensions) if (await stat(path.join(root, base + suffix)).then(entry => entry.isFile(), () => false)) return base + suffix;
        issues.push(`${file}: unresolved import ${specifier}`);
        return null;
    }
    async function imports(file, code, client = false) {
        const ast = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
        const found = [];
        function visit(node) {
            if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
                // With verbatimModuleSyntax, named type-only specifiers still leave
                // an empty runtime import/export. Only whole type declarations erase it.
                const typeOnly = ts.isImportDeclaration(node) ? node.importClause?.isTypeOnly : node.isTypeOnly;
                if (!typeOnly) found.push(node.moduleSpecifier.text);
            }
            if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) found.push(node.arguments[0].text);
            ts.forEachChild(node, visit);
        }
        visit(ast);
        for (const specifier of found) {
            graph.get(file).specifiers.push(specifier);
            const target = await resolve(file, specifier);
            if (target) { graph.get(file).targets.push(target); if (client) clients.push(target); }
            if (client && serverOnly(specifier)) issues.push(`${file}: browser imports ${specifier}`);
        }
    }
    async function scan(directory) {
        for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
            const file = `${directory}/${entry.name}`;
            if (entry.isDirectory()) { await scan(file); continue; }
            if (!/\.(astro|mjs|js|ts|mdx)$/.test(file)) continue;
            const source = await readFile(path.join(root, file), 'utf8');
            graph.set(file, { targets: [], specifiers: [] });
            if (file.endsWith('.astro')) {
                const { ast } = await parse(source);
                const visit = async node => {
                    if (node.type === 'frontmatter') await imports(file, node.value);
                    if (node.type === 'element' && node.name === 'script') {
                        const src = node.attributes.find(attribute => attribute.name === 'src' && attribute.kind === 'quoted')?.value;
                        if (src) { const target = await resolve(file, src); if (target) { graph.get(file).targets.push(target); clients.push(target); } }
                        for (const child of node.children ?? []) if (child.value) await imports(file, child.value, true);
                    }
                    for (const child of node.children ?? []) await visit(child);
                };
                await visit(ast);
            } else if (file.endsWith('.mdx')) {
                // MDX imports are authored at the start of lines; prose is not JavaScript.
                await imports(file, source.split('\n').filter(line => /^import\s/.test(line)).join('\n'));
            } else await imports(file, source);
        }
    }
    await scan('src');
    return { files: graph.size, issues: [...issues, ...boundaryIssues(graph, clients)].sort() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const report = await inspectImports();
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.issues.length ? 1 : 0;
}
