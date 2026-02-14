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
    JaegerClient,
} from './types';

import * as logger from '../logger';
import axios, { AxiosResponse } from 'axios';

const DEFAULT_PORT = 16686;
const URL_SCHEMA_SEPARATOR: string = '://';
const SECURE_URL_SCHEMA: string = 'https://';
const INSECURE_URL_SCHEMA: string = 'http://';
const SECURE_URL_PORT: number = 443;
const HTTP_STATUS_CODE_NOT_FOUND: number = 404;

export class JaegerHttpClient implements JaegerClient {
    private readonly url: string;
    private readonly port: number;
    private readonly authorizationHeader: string | undefined;
    private readonly requestTimeoutMs: number;

    private readonly baseUrl: string;

    constructor(clientConfigurations: ClientConfigurations) {
        const { url: baseUrl, port } = JaegerHttpClient._parseUrlAndPort(
            clientConfigurations.url,
            clientConfigurations.port
        );
        this.url = baseUrl;
        this.port = port;
        this.baseUrl = port != null ? `${baseUrl}:${port}` : baseUrl;
        this.authorizationHeader = clientConfigurations.authorizationHeader;
        this.requestTimeoutMs =
            clientConfigurations.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    }

    /** Returns base URL (no port) and port. If URL has :port, it is stripped and returned; otherwise port from config or default. */
    private static _parseUrlAndPort(
        url: string,
        configPort?: number
    ): { url: string; port: number } {
        const schemaIdx = url.indexOf(URL_SCHEMA_SEPARATOR);
        if (schemaIdx < 0) {
            url =
                configPort === SECURE_URL_PORT
                    ? `${SECURE_URL_SCHEMA}${url}`
                    : `${INSECURE_URL_SCHEMA}${url}`;
        }
        const match = url.match(/^(.+):(\d+)$/);
        if (match) {
            return {
                url: match[1],
                port: parseInt(match[2], 10),
            };
        }
        const port =
            configPort ??
            (url.startsWith(SECURE_URL_SCHEMA)
                ? SECURE_URL_PORT
                : DEFAULT_PORT);
        return { url, port };
    }

    private async _get<R>(path: string, params?: any): Promise<R> {
        const response: AxiosResponse = await axios.get(
            `${this.baseUrl}/${path}`.replace(/([^:])\/\/+/, '$1/'),
            {
                params,
                timeout: this.requestTimeoutMs,
                headers: {
                    Authorization: this.authorizationHeader,
                },
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
            (rs.resource = this._normalizeResource(rs.resource)),
                (rs.scopeSpans = rs.scopeSpans?.map((ss: any) => {
                    ss.scope = this._normalizeInstrumentationScope(ss.scope);
                    ss.spans = ss.spans?.map((s: any) => {
                        return this._normalizeSpan(s);
                    });
                    return ss;
                }));
            return rs;
        });
    }

    private _handleError<R>(err: any): R {
        if (err.status === HTTP_STATUS_CODE_NOT_FOUND) {
            return {} as R;
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
