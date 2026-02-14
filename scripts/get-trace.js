#!/usr/bin/env node
/**
 * Fetches a single trace by ID using the same Jaeger client as the MCP server.
 * Use to verify connectivity and that a trace is reachable (e.g. after setting JAEGER_URL).
 *
 * Usage:
 *   npm run build
 *   JAEGER_URL=http://localhost:16686 node scripts/get-trace.js <traceId>
 *
 * Optional env: JAEGER_URL, JAEGER_PORT, JAEGER_PROTOCOL (HTTP|GRPC), JAEGER_AUTHORIZATION_HEADER
 * Trace ID must be 32 hex characters (e.g. 014c2d3d2f2bc95b145834e7c6063744).
 */

const TRACE_ID_REGEX = /^[0-9a-fA-F]{32}$/;

function main() {
    const traceId = process.argv[2];
    if (!traceId || !TRACE_ID_REGEX.test(traceId)) {
        console.error('Usage: node scripts/get-trace.js <traceId>');
        console.error('  traceId: 32-character hexadecimal string (e.g. 014c2d3d2f2bc95b145834e7c6063744)');
        process.exit(1);
    }

    if (!process.env.JAEGER_URL) {
        console.error('Error: JAEGER_URL is not set. Set it to your Jaeger API URL (e.g. http://localhost:16686).');
        process.exit(1);
    }

    const { createClient } = require('../dist/client/index.js');
    const client = createClient({
        url: process.env.JAEGER_URL,
        port: process.env.JAEGER_PORT ? parseInt(process.env.JAEGER_PORT, 10) : undefined,
        authorizationHeader: process.env.JAEGER_AUTHORIZATION_HEADER,
    });

    client
        .getTrace({ traceId })
        .then((response) => {
            const out = response.resourceSpans ?? [];
            console.log(JSON.stringify(out, null, 2));
        })
        .catch((err) => {
            console.error('Error fetching trace:', err.message);
            process.exit(1);
        });
}

main();
