import {
    FindTracesRequest,
    FindTracesResponse,
    GetOperationsRequest,
    GetOperationsResponse,
    GetServicesRequest,
    GetServicesResponse,
    GetTraceRequest,
    GetTraceResponse,
    ResourceSpans,
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

    private async _get<R>(
        path: string,
        params?: Record<string, unknown>
    ): Promise<R> {
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

    private _normalizeAttribute(
        attribute: Record<string, unknown>
    ): Record<string, unknown> {
        const attr = attribute as {
            value?: { intValue?: unknown; doubleValue?: unknown };
        };
        if (typeof attr.value?.intValue === 'string') {
            attr.value.intValue = parseInt(attr.value.intValue as string);
        }
        if (typeof attr.value?.doubleValue === 'string') {
            attr.value.doubleValue = parseFloat(
                attr.value.doubleValue as string
            );
        }
        return attribute;
    }

    private _normalizeResource(
        resource: Record<string, unknown>
    ): Record<string, unknown> {
        const res = resource as { attributes?: unknown[] };
        res.attributes = res.attributes?.map((a) =>
            this._normalizeAttribute(a as Record<string, unknown>)
        );
        return resource;
    }

    private _normalizeInstrumentationScope(
        instrumentationScope: Record<string, unknown>
    ): Record<string, unknown> {
        const scope = instrumentationScope as { attributes?: unknown[] };
        scope.attributes = scope.attributes?.map((a) =>
            this._normalizeAttribute(a as Record<string, unknown>)
        );
        return instrumentationScope;
    }

    private _normalizeEvent(
        event: Record<string, unknown>
    ): Record<string, unknown> {
        const ev = event as { attributes?: unknown[] };
        ev.attributes = ev.attributes?.map((a) =>
            this._normalizeAttribute(a as Record<string, unknown>)
        );
        return event;
    }

    private _normalizeLink(
        link: Record<string, unknown>
    ): Record<string, unknown> {
        const l = link as { attributes?: unknown[] };
        l.attributes = l.attributes?.map((a) =>
            this._normalizeAttribute(a as Record<string, unknown>)
        );
        return link;
    }

    private _normalizeSpan(
        span: Record<string, unknown>
    ): Record<string, unknown> {
        const s = span as {
            kind?: number | string;
            attributes?: unknown[];
            events?: unknown[];
            links?: unknown[];
        };
        if (typeof s.kind === 'number') {
            s.kind = toSpanKind(s.kind)?.toString();
        }
        s.attributes = s.attributes?.map((a) =>
            this._normalizeAttribute(a as Record<string, unknown>)
        );
        s.events = s.events?.map((a) =>
            this._normalizeEvent(a as Record<string, unknown>)
        );
        s.links = s.links?.map((a) =>
            this._normalizeLink(a as Record<string, unknown>)
        );
        return span;
    }

    private _normalizeResourceSpans(
        resourceSpans: Record<string, unknown>[]
    ): Record<string, unknown>[] {
        return resourceSpans.map((rs) => {
            const r = rs as { resource?: unknown; scopeSpans?: unknown[] };
            r.resource = this._normalizeResource(
                (r.resource ?? {}) as Record<string, unknown>
            );
            r.scopeSpans = r.scopeSpans?.map((ss) => {
                const s = ss as { scope?: unknown; spans?: unknown[] };
                s.scope = this._normalizeInstrumentationScope(
                    (s.scope ?? {}) as Record<string, unknown>
                );
                s.spans = s.spans?.map((sSpan) =>
                    this._normalizeSpan(sSpan as Record<string, unknown>)
                );
                return ss;
            });
            return rs;
        });
    }

    /**
     * Maps HTTP/client errors to user-facing messages. Axios timeout (ECONNABORTED) becomes a
     * timeout message; 404 returns empty result; others are rethrown.
     */
    private _handleError<R>(err: unknown): R {
        const status =
            (err as { response?: { status?: number }; status?: number })
                ?.response?.status ?? (err as { status?: number })?.status;
        if (status === HTTP_STATUS_CODE_NOT_FOUND) {
            return {} as R;
        }
        const e = err as { code?: string; message?: string };
        const isTimeout =
            e.code === 'ECONNABORTED' ||
            (e.message && String(e.message).toLowerCase().includes('timeout'));
        if (isTimeout) {
            throw new Error(
                formatRequestTimedOutMessage(this.requestTimeoutMs)
            );
        }
        throw err;
    }

    async getServices(
        _request: GetServicesRequest
    ): Promise<GetServicesResponse> {
        try {
            const httpResponse = await this._get<{ services?: string[] }>(
                '/api/v3/services'
            );
            return {
                services: httpResponse.services,
            } as GetServicesResponse;
        } catch (err: unknown) {
            return this._handleError(err);
        }
    }

    async getOperations(
        request: GetOperationsRequest
    ): Promise<GetOperationsResponse> {
        try {
            const httpResponse = await this._get<{ operations?: unknown[] }>(
                '/api/v3/operations',
                {
                    service: request.service,
                    span_kind: request.spanKind?.toString().toLowerCase(),
                }
            );
            return {
                operations: httpResponse.operations,
            } as GetOperationsResponse;
        } catch (err: unknown) {
            return this._handleError(err);
        }
    }

    async getTrace(request: GetTraceRequest): Promise<GetTraceResponse> {
        try {
            const httpResponse = await this._get<{
                result?: { resourceSpans?: Record<string, unknown>[] };
            }>(`/api/v3/traces/${request.traceId}`, {
                startTime: this._toDateTimeString(request.startTime),
                endTime: this._toDateTimeString(request.endTime),
            });
            return {
                resourceSpans: this._normalizeResourceSpans(
                    httpResponse.result?.resourceSpans ?? []
                ) as ResourceSpans[],
            };
        } catch (err: unknown) {
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
            (params as Record<string, unknown>)['query.attributes'] =
                JSON.stringify(request.query.attributes);
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
            const httpResponse = await this._get<{
                result?: { resourceSpans?: Record<string, unknown>[] };
            }>('/api/v3/traces', params);
            const rawSpans = httpResponse.result?.resourceSpans ?? [];
            const resourceSpans = this._normalizeResourceSpans(
                rawSpans
            ) as ResourceSpans[];
            if (logger.isDebugEnabled()) {
                logger.debug(
                    `[HTTP] findTraces response in ${Date.now() - t0}ms`,
                    'resourceSpans.length=',
                    resourceSpans.length
                );
            }
            return { resourceSpans };
        } catch (err: unknown) {
            if (logger.isDebugEnabled()) {
                const e = err as {
                    code?: unknown;
                    name?: unknown;
                    message?: unknown;
                };
                logger.debug(
                    `[HTTP] findTraces error after ${Date.now() - t0}ms`,
                    e?.code ?? e?.name,
                    e?.message
                );
            }
            return this._handleError(err);
        }
    }
}
