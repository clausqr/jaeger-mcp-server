/**
 * URL/port parsing for Jaeger HTTP client.
 * Pure helpers: add scheme if missing, strip :port from URL and resolve port.
 */

const DEFAULT_PORT = 16686;
const URL_SCHEMA_SEPARATOR = '://';
const SECURE_URL_SCHEMA = 'https://';
const INSECURE_URL_SCHEMA = 'http://';
const SECURE_URL_PORT = 443;

/**
 * Returns base URL (no trailing :port) and port.
 * Adds http(s) scheme if missing; if URL has :port, strips it and uses that port; else uses configPort or default.
 */
export function parseUrlAndPort(
    url: string,
    configPort?: number
): { url: string; port: number } {
    let normalized = url;
    const schemaIdx = normalized.indexOf(URL_SCHEMA_SEPARATOR);
    if (schemaIdx < 0) {
        normalized =
            configPort === SECURE_URL_PORT
                ? `${SECURE_URL_SCHEMA}${normalized}`
                : `${INSECURE_URL_SCHEMA}${normalized}`;
    }
    const match = normalized.match(/^(.+):(\d+)$/);
    if (match) {
        return {
            url: match[1],
            port: parseInt(match[2], 10),
        };
    }
    const port =
        configPort ??
        (normalized.startsWith(SECURE_URL_SCHEMA)
            ? SECURE_URL_PORT
            : DEFAULT_PORT);
    return { url: normalized, port };
}
