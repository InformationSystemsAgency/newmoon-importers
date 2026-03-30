import dotenv from 'dotenv';
import path from 'path';

export function parseEnv(dirname) {
    dotenv.config({ path: path.resolve(dirname, '.env') });
    dotenv.config({ path: path.resolve(dirname, '..', '.env') });

    const directusUrl = process.env.DIRECTUS_URL;
    const directusToken = process.env.DIRECTUS_IMPORTER_TOKEN;

    if (!directusUrl) {
        console.error('❌ DIRECTUS_URL must be set in the environment (e.g. in .env).');
        process.exit(1);
    }
    if (!directusToken) {
        console.error('❌ DIRECTUS_IMPORTER_TOKEN must be set in the environment (e.g. in .env).');
        process.exit(1);
    }

    return {
        directusUrl,
        directusToken,
    }
}