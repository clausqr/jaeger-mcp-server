import { createClient, JaegerClient } from './client';
import * as logger from './logger';
import { tools, Tool, ToolInput } from './tools/';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const SERVER_NAME = 'jaeger-mcp-server';
const { version: SERVER_VERSION } = require('../package.json');

function _createJaegerClient(): JaegerClient {
    if (!process.env.JAEGER_URL) {
        throw new Error(
            'No Jaeger URL (by "JAEGER_URL" environment variable) is specified'
        );
    }
    const requestTimeoutMs = process.env.JAEGER_REQUEST_TIMEOUT_MS
        ? parseInt(process.env.JAEGER_REQUEST_TIMEOUT_MS, 10)
        : undefined;
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
            } catch (error: any) {
                if (tool.name() === 'find-traces' && logger.isDebugEnabled()) {
                    logger.debug('find-traces error', error.message);
                }
                return {
                    content: [
                        { type: 'text', text: `Error: ${error.message}` },
                    ],
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
