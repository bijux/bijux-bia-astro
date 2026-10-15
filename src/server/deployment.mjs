import { readFile } from 'node:fs/promises';
import { buildConfiguration, publicDefaults } from './configuration.mjs';

/** Reject ineffective runtime overrides instead of silently serving the previous configuration. */
export async function deploymentConfiguration(file, environment = process.env) {
    const { configuration } = JSON.parse(await readFile(file, 'utf8'));
    if (!configuration || Object.keys(configuration).length !== Object.keys(publicDefaults).length || Object.keys(publicDefaults).some(name => typeof configuration[name] !== 'string')) throw new Error('Invalid deployment configuration.');
    const validated = buildConfiguration(configuration);
    if (Object.entries(validated).some(([name, value]) => value !== configuration[name])) throw new Error('Invalid deployment configuration.');
    for (const [name, value] of Object.entries(configuration)) {
        if (environment[name] !== undefined && environment[name] !== value) throw new Error(`${name} is fixed at build time; rebuild the deployment to change it.`);
    }
    return configuration;
}
