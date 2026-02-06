import { JaegerClient } from '../client';

import { ZodRawShape } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

export type ToolParamsSchema = ZodRawShape;
/** Parsed tool arguments (output of params schema). Portable across Zod v3/v4. */
export type ToolInput = Record<string, unknown>;
export type ToolOutput = string;

export interface Tool {
    name(): string;
    description(): string;
    paramsSchema(): ToolParamsSchema;
    handle(
        server: Server,
        jaegerClient: JaegerClient,
        args: ToolInput
    ): Promise<ToolOutput>;
}
