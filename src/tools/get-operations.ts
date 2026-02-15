import { JaegerClient } from '../client';
import { GetOperationsResponse, toSpanKind } from '../domain';
import { Tool, ToolInput } from './types';

import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

export class GetOperations implements Tool {
    name(): string {
        return 'get-operations';
    }

    description(): string {
        return 'Gets the operations as JSON array of object with "name" and "spanKind" properties';
    }

    paramsSchema() {
        return {
            service: z
                .string()
                .describe('Filters operations by service name (Required)'),
            spanKind: z
                .enum([
                    '',
                    'server',
                    'client',
                    'producer',
                    'consumer',
                    'internal',
                ])
                .describe(
                    'Filters operations by OpenTelemetry span kind ("server", "client", "producer", "consumer", "internal") (Optional)'
                )
                .optional(),
        };
    }

    async handle(
        server: Server,
        jaegerClient: JaegerClient,
        args: ToolInput
    ): Promise<string> {
        const response: GetOperationsResponse =
            await jaegerClient.getOperations({
                service: args.service as string,
                spanKind: toSpanKind(args.spanKind as string | undefined),
            });
        return JSON.stringify(response.operations);
    }
}
