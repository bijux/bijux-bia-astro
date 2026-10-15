import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Record the effective Vite public values, including .env expansion and Astro schema defaults. */
export function catalogueEnvironment(defaults, site) {
    return {
        name: 'bia-catalogue-environment',
        configResolved(config) {
            const directory = process.env.CATALOGUE_BUILD_DIRECTORY;
            if (!directory) return;
            const environment = Object.fromEntries([...new Set([...Object.keys(defaults), ...Object.keys(config.env).filter(name => name.startsWith('PUBLIC_'))])]
                .sort().map(name => [name, name === 'SITE_URL' ? site : config.env[name] ?? defaults[name]]));
            if (process.env.CATALOGUE_SNAPSHOT) {
                const index = JSON.parse(readFileSync(join(directory, 'index.json'), 'utf8'));
                if (JSON.stringify(environment) !== JSON.stringify(index.environment)) throw new Error('Snapshot public configuration differs from this build. Capture fresh inputs for the intended environment.');
            } else writeFileSync(join(directory, 'environment.json'), JSON.stringify(environment));
        },
    };
}
