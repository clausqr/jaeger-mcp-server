import { createClient, JaegerClient, MAX_REQUEST_TIMEOUT_MS } from './client';
import * as logger from './logger';
import { tools, Tool, ToolInput } from './tools/';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/* eslint-disable @typescript-eslint/no-require-imports -- version read at load time from package.json */
const SERVER_NAME = 'jaeger-mcp-server';
const { version: SERVER_VERSION } = require('../package.json');

/**
 * Parses and validates JAEGER_REQUEST_TIMEOUT_MS. Throws with a clear message if invalid.
 * Valid: positive integer, optional max (MAX_REQUEST_TIMEOUT_MS). Omit env => undefined.
 */
function _parseRequestTimeoutMs(): number | undefined {
    const raw = process.env.JAEGER_REQUEST_TIMEOUT_MS;
    if (raw === undefined || raw === '') {
        return undefined;
    }
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
        throw new Error(
            `Invalid JAEGER_REQUEST_TIMEOUT_MS: must be a positive number. Got: ${JSON.stringify(raw)}`
        );
    }
    if (parsed <= 0) {
        throw new Error(
            `Invalid JAEGER_REQUEST_TIMEOUT_MS: must be positive. Got: ${parsed}`
        );
    }
    if (parsed > MAX_REQUEST_TIMEOUT_MS) {
        throw new Error(
            `Invalid JAEGER_REQUEST_TIMEOUT_MS: must be at most ${MAX_REQUEST_TIMEOUT_MS} (${MAX_REQUEST_TIMEOUT_MS / 1000}s). Got: ${parsed}`
        );
    }
    return parsed;
}

function _createJaegerClient(): JaegerClient {
    if (!process.env.JAEGER_URL) {
        throw new Error(
            'No Jaeger URL (by "JAEGER_URL" environment variable) is specified'
        );
    }
    const requestTimeoutMs = _parseRequestTimeoutMs();
    return createClient({
        url: process.env.JAEGER_URL!,
        port: process.env.JAEGER_PORT
            ? parseInt(process.env.JAEGER_PORT, 10)
            : undefined,
        authorizationHeader: process.env.JAEGER_AUTHORIZATION_HEADER,
        requestTimeoutMs,
    });
}

export async function startServer(): Promise<void> {
    const server = new McpServer(
        {
            name: SERVER_NAME,
            version: SERVER_VERSION,
        },
        {
            capabilities: {
                resources: {},
                tools: {},
                logging: {},
            },
        }
    );

    const jaegerClient: JaegerClient = _createJaegerClient();

    const createToolCallback = (tool: Tool) => {
        return async (args: ToolInput): Promise<CallToolResult> => {
            try {
                if (tool.name() === 'find-traces' && logger.isDebugEnabled()) {
                    logger.debug(
                        `find-traces start`,
                        logger.toJson({
                            serviceName: args.serviceName,
                            startTimeMin: args.startTimeMin,
                            startTimeMax: args.startTimeMax,
                            searchDepth: args.searchDepth,
                        })
                    );
                }
                const response = await tool.handle(
                    server.server,
                    jaegerClient,
                    args
                );
                if (tool.name() === 'find-traces' && logger.isDebugEnabled()) {
                    logger.debug('find-traces end');
                }
                return {
                    content: [{ type: 'text', text: response }],
                    isError: false,
                };
            } catch (error: unknown) {
                const message =
                    error instanceof Error ? error.message : String(error);
                if (tool.name() === 'find-traces' && logger.isDebugEnabled()) {
                    logger.debug('find-traces error', message);
                }
                return {
                    content: [{ type: 'text', text: `Error: ${message}` }],
                    isError: true,
                };
            }
        };
    };

    tools.forEach((t: Tool) => {
        logger.info(`Registering tool ${t.name} ...`);
        server.tool(
            t.name(),
            t.description(),
            t.paramsSchema(),
            createToolCallback(t)
        );
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Keep process alive until stdin closes (client disconnect) or process is killed.
    await new Promise<void>((resolve) => {
        const onEnd = () => resolve();
        process.stdin.once('end', onEnd);
        process.stdin.once('close', onEnd);
    });
}
