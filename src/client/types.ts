import {
    FindTracesRequest,
    FindTracesResponse,
    GetOperationsRequest,
    GetOperationsResponse,
    GetServicesRequest,
    GetServicesResponse,
    GetTraceRequest,
    GetTraceResponse,
} from '../domain';

/** Default request timeout in ms; used for find-traces and other API calls to avoid indefinite stalls. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

/** Maximum allowed request timeout in ms (5 minutes). Used when validating JAEGER_REQUEST_TIMEOUT_MS. */
export const MAX_REQUEST_TIMEOUT_MS = 300_000;

/**
 * Returns a user-facing message for request timeout. Use when mapping DEADLINE_EXCEEDED or axios timeout.
 */
export function formatRequestTimedOutMessage(timeoutMs: number): string {
    const seconds = Math.round(timeoutMs / 1000);
    return `Request timed out after ${seconds}s`;
}

export type ClientConfigurations = {
    url: string;
    port?: number;
    authorizationHeader?: string;
    /** Request timeout in ms (e.g. for find-traces). Default 60000. */
    requestTimeoutMs?: number;
};

export interface JaegerClient {
    getServices(request: GetServicesRequest): Promise<GetServicesResponse>;
    getOperations(
        request: GetOperationsRequest
    ): Promise<GetOperationsResponse>;
    getTrace(request: GetTraceRequest): Promise<GetTraceResponse>;
    findTraces(request: FindTracesRequest): Promise<FindTracesResponse>;
}
