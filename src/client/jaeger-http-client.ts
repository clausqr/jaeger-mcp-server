import {
    FindTracesRequest,
    FindTracesResponse,
    GetOperationsRequest,
    GetOperationsResponse,
    GetServicesRequest,
    GetServicesResponse,
    GetTraceRequest,
    GetTraceResponse,
    toSpanKind,
} from '../domain';
import {
    ClientConfigurations,
    DEFAULT_REQUEST_TIMEOUT_MS,
    formatRequestTimedOutMessage,
    JaegerClient,
} from './types';
import { parseUrlAndPort } from './url-utils';

import * as logger from '../logger';
import axios, { AxiosResponse } from 'axios';

const HTTP_STATUS_CODE_NOT_FOUND = 404;

export class JaegerHttpClient implements JaegerClient {
    private readonly url: string;
    private readonly port: number;
    private readonly authorizationHeader: string | undefined;
    private readonly requestTimeoutMs: number;

    private readonly baseUrl: string;

    constructor(clientConfigurations: ClientConfigurations) {
        const { url: baseUrl, port } = parseUrlAndPort(
            clientConfigurations.url,
            clientConfigurations.port
        );
        this.url = baseUrl;
        this.port = port;
        this.baseUrl = `${baseUrl}:${port}`;
        this.authorizationHeader = clientConfigurations.authorizationHeader;
        this.requestTimeoutMs =
            clientConfigurations.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    }

    private async _get<R>(path: string, params?: any): Promise<R> {
        const headers: Record<string, string> = {};
        if (this.authorizationHeader) {
            headers.Authorization = this.authorizationHeader;
        }
        const response: AxiosResponse = await axios.get(
            `${this.baseUrl}/${path}`.replace(/([^:])\/\/+/, '$1/'),
            {
                params,
                timeout: this.requestTimeoutMs,
                headers,
            }
        );
        if (response.status != 200) {
            throw new Error(
                `Request failed with status code ${response.status}`
            );
        }
        return response.data as R;
    }

    private _toDateTimeString(timestamp?: number): string | undefined {
        if (timestamp) {
            return new Date(timestamp).toISOString();
        }
    }

    private _toDurationUnit(durationMs?: number): string | undefined {
        if (durationMs) {
            return `${durationMs}ms`;
        }
    }

    private _normalizeAttribute(attribute: any): any {
        if (typeof attribute.value?.intValue === 'string') {
            attribute.value.intValue = parseInt(
                attribute.value?.intValue as string
            );
        }
        if (typeof attribute.value?.doubleValue === 'string') {
            attribute.value.doubleValue = parseFloat(
                attribute.value?.doubleValue as string
            );
        }
        return attribute;
    }

    private _normalizeResource(resource: any): any {
        resource.attributes = resource.attributes?.map((a: any) => {
            return this._normalizeAttribute(a);
        });
        return resource;
    }

    private _normalizeInstrumentationScope(instrumentationScope: any): any {
        instrumentationScope.attributes = instrumentationScope.attributes?.map(
            (a: any) => {
                return this._normalizeAttribute(a);
            }
        );
        return instrumentationScope;
    }

    private _normalizeEvent(event: any): any {
        event.attributes = event.attributes?.map((a: any) => {
            return this._normalizeAttribute(a);
        });
        return event;
    }

    private _normalizeLink(link: any): any {
        link.attributes = link.attributes?.map((a: any) => {
            return this._normalizeAttribute(a);
        });
        return link;
    }

    private _normalizeSpan(span: any): any {
        if (typeof span.kind === 'number') {
            span.kind = toSpanKind(span.kind as number)?.toString();
        }
        span.attributes = span.attributes?.map((a: any) => {
            return this._normalizeAttribute(a);
        });
        span.events = span.events?.map((a: any) => {
            return this._normalizeEvent(a);
        });
        span.links = span.links?.map((a: any) => {
            return this._normalizeLink(a);
        });
        return span;
    }

    private _normalizeResourceSpans(resourceSpans: any[]): any[] {
        return resourceSpans.map((rs: any) => {
            rs.resource = this._normalizeResource(rs.resource);
            rs.scopeSpans = rs.scopeSpans?.map((ss: any) => {
                ss.scope = this._normalizeInstrumentationScope(ss.scope);
                ss.spans = ss.spans?.map((s: any) => this._normalizeSpan(s));
                return ss;
            });
            return rs;
        });
    }

    /**
     * Maps HTTP/client errors to user-facing messages. Axios timeout (ECONNABORTED) becomes a
     * timeout message; 404 returns empty result; others are rethrown.
     */
    private _handleError<R>(err: any): R {
        const status = err?.response?.status ?? err?.status;
        if (status === HTTP_STATUS_CODE_NOT_FOUND) {
            return {} as R;
        }
        const isTimeout =
            err.code === 'ECONNABORTED' ||
            (err.message && String(err.message).toLowerCase().includes('timeout'));
        if (isTimeout) {
            throw new Error(
                formatRequestTimedOutMessage(this.requestTimeoutMs)
            );
        }
        throw err;
    }

    async getServices(
        request: GetServicesRequest
    ): Promise<GetServicesResponse> {
        try {
            const httpResponse: any = await this._get('/api/v3/services');
            return {
                services: httpResponse.services,
            } as GetServicesResponse;
        } catch (err: any) {
            return this._handleError(err);
        }
    }

    async getOperations(
        request: GetOperationsRequest
    ): Promise<GetOperationsResponse> {
        try {
            const httpResponse: any = await this._get('/api/v3/operations', {
                service: request.service,
                span_kind: request.spanKind?.toString().toLowerCase(),
            });
            return {
                operations: httpResponse.operations,
            } as GetOperationsResponse;
        } catch (err: any) {
            return this._handleError(err);
        }
    }

    async getTrace(request: GetTraceRequest): Promise<GetTraceResponse> {
        try {
            const httpResponse: any = await this._get(
                `/api/v3/traces/${request.traceId}`,
                {
                    startTime: this._toDateTimeString(request.startTime),
                    endTime: this._toDateTimeString(request.endTime),
                }
            );
            return {
                resourceSpans: this._normalizeResourceSpans(
                    httpResponse.result.resourceSpans
                ),
            };
        } catch (err: any) {
            return this._handleError(err);
        }
    }

    /**
     * Find traces matching the query. Sends all query params to /api/v3/traces,
     * including attributes when present so attribute filters work over HTTP
     * (parity with gRPC). The Jaeger HTTP API expects query.attributes as a
     * single query param with a URL-encoded JSON string map (e.g. {"key":"value"}).
     */
    async findTraces(request: FindTracesRequest): Promise<FindTracesResponse> {
        const t0 = Date.now();
        const params = {
            'query.service_name': request.query.serviceName,
            'query.operation_name': request.query.operationName,
            'query.start_time_min': this._toDateTimeString(
                request.query.startTimeMin
            ),
            'query.start_time_max': this._toDateTimeString(
                request.query.startTimeMax
            ),
            'query.duration_min': this._toDurationUnit(
                request.query.durationMin
            ),
            'query.duration_max': this._toDurationUnit(
                request.query.durationMax
            ),
            'query.search_depth': request.query.searchDepth,
        };
        if (
            request.query.attributes &&
            Object.keys(request.query.attributes).length > 0
        ) {
            (params as Record<string, any>)['query.attributes'] = JSON.stringify(
                request.query.attributes
            );
        }
        try {
            if (logger.isDebugEnabled()) {
                logger.debug(
                    '[HTTP] findTraces request',
                    logger.toJson(params),
                    'baseUrl=',
                    this.baseUrl
                );
            }
            const httpResponse: any = await this._get('/api/v3/traces', params);
            const rawSpans = httpResponse.result?.resourceSpans ?? [];
            const resourceSpans = this._normalizeResourceSpans(rawSpans);
            if (logger.isDebugEnabled()) {
                logger.debug(
                    `[HTTP] findTraces response in ${Date.now() - t0}ms`,
                    'resourceSpans.length=',
                    resourceSpans.length
                );
            }
            return { resourceSpans };
        } catch (err: any) {
            if (logger.isDebugEnabled()) {
                logger.debug(
                    `[HTTP] findTraces error after ${Date.now() - t0}ms`,
                    err?.code ?? err?.name,
                    err?.message
                );
            }
            return this._handleError(err);
        }
    }
}
