#!/usr/bin/env node
/**
 * Runs a simple find-traces query (same client as MCP). Use to test connectivity
 * and timeouts without going through MCP. Default: 1-hour window, searchDepth 10.
 *
 * Usage:
 *   npm run build
 *   JAEGER_URL=http://localhost:16777 node scripts/find-traces.js [serviceName]
 *
 * Optional env: JAEGER_URL, JAEGER_PROTOCOL (HTTP|GRPC), JAEGER_REQUEST_TIMEOUT_MS
 * Optional args: serviceName (default: webui-dashboard). Time window is last 1 hour.
 * Client defaults to GRPC. For HTTP-only ports set JAEGER_PROTOCOL=HTTP.
 */

const serviceName = process.argv[2] || 'webui-dashboard';
const now = Date.now();
const oneHourMs = 60 * 60 * 1000;
const startTimeMin = new Date(now - oneHourMs).toISOString();
const startTimeMax = new Date(now).toISOString();

if (!process.env.JAEGER_URL) {
    console.error('Error: JAEGER_URL is not set.');
    process.exit(1);
}

const DEFAULT_SCRIPT_TIMEOUT_MS = 60_000;
const requestTimeoutMs = process.env.JAEGER_REQUEST_TIMEOUT_MS
    ? parseInt(process.env.JAEGER_REQUEST_TIMEOUT_MS, 10)
    : DEFAULT_SCRIPT_TIMEOUT_MS;

const { createClient } = require('../dist/client/index.js');
const client = createClient({
    url: process.env.JAEGER_URL,
    port: process.env.JAEGER_PORT
        ? parseInt(process.env.JAEGER_PORT, 10)
        : undefined,
    authorizationHeader: process.env.JAEGER_AUTHORIZATION_HEADER,
    requestTimeoutMs,
});

console.error(
    `find-traces protocol=${process.env.JAEGER_PROTOCOL} timeout=${requestTimeoutMs}ms serviceName=${serviceName} startTimeMin=${startTimeMin} startTimeMax=${startTimeMax} searchDepth=10`
);
if (process.env.JAEGER_DEBUG === '1') {
    console.error('(JAEGER_DEBUG=1: client debug output enabled)');
}
const t0 = Date.now();
client
    .findTraces({
        query: {
            serviceName,
            startTimeMin: new Date(startTimeMin).getTime(),
            startTimeMax: new Date(startTimeMax).getTime(),
            searchDepth: 10,
        },
    })
    .then((response) => {
        const elapsed = Date.now() - t0;
        const spans = response.resourceSpans || [];
        console.error(`find-traces end: ${spans.length} trace(s), ${elapsed}ms`);
        console.log(JSON.stringify(spans, null, 2));
    })
    .catch((err) => {
        console.error('find-traces error:', err.message);
        process.exit(1);
    });
