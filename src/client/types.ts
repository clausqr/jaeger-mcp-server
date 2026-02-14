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
