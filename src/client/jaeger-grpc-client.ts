import {
    Attribute,
    Event,
    FindTracesRequest,
    FindTracesResponse,
    GetOperationsRequest,
    GetOperationsResponse,
    GetServicesRequest,
    GetServicesResponse,
    GetTraceRequest,
    GetTraceResponse,
    InstrumentationScope,
    Link,
    Operation,
    Resource,
    ResourceSpans,
    ScopeSpans,
    Span,
    Status,
    toSpanKind,
    toStatusCode,
} from '../domain';
import {
    ClientConfigurations,
    DEFAULT_REQUEST_TIMEOUT_MS,
    formatRequestTimedOutMessage,
    JaegerClient,
} from './types';
import * as logger from '../logger';
import { google, jaeger, opentelemetry } from '../generated/root';

import Long from 'long';
import tls from 'tls';
import * as grpc from '@grpc/grpc-js';

import IEvent = opentelemetry.proto.trace.v1.Span.IEvent;
import IFindTracesRequest = jaeger.api_v3.IFindTracesRequest;
import IGetServicesRequest = jaeger.api_v3.IGetServicesRequest;
import IGetServicesResponse = jaeger.api_v3.IGetServicesResponse;
import IGetOperationsRequest = jaeger.api_v3.IGetOperationsRequest;
import IGetOperationsResponse = jaeger.api_v3.IGetOperationsResponse;
import IGetTraceRequest = jaeger.api_v3.IGetTraceRequest;
import IInstrumentationScope = opentelemetry.proto.common.v1.IInstrumentationScope;
import IKeyValue = opentelemetry.proto.common.v1.IKeyValue;
import ILink = opentelemetry.proto.trace.v1.Span.ILink;
import IOperation = jaeger.api_v3.IOperation;
import IResource = opentelemetry.proto.resource.v1.IResource;
import IResourceSpans = opentelemetry.proto.trace.v1.IResourceSpans;
import IScopeSpans = opentelemetry.proto.trace.v1.IScopeSpans;
import ISpan = opentelemetry.proto.trace.v1.ISpan;
import IStatus = opentelemetry.proto.trace.v1.IStatus;
import ITimestamp = google.protobuf.ITimestamp;
import QueryService = jaeger.api_v3.QueryService;
import TracesData = opentelemetry.proto.trace.v1.TracesData;
import IDuration = google.protobuf.IDuration;

const DEFAULT_PORT: number = 16685;
const GRPC_SERVICE_NAME: string = 'jaeger.api_v3.QueryService';
const URL_SCHEMA_SEPARATOR: string = '://';
const SECURE_URL_SCHEMA: string = 'https://';
const INSECURE_URL_SCHEMA: string = 'http://';
const SECURE_URL_PORT: number = 443;

export class JaegerGrpcClient implements JaegerClient {
    private readonly queryService: QueryService;
    private readonly metadata: grpc.Metadata;
    private readonly requestTimeoutMs: number;

    constructor(clientConfigurations: ClientConfigurations) {
        this.requestTimeoutMs =
            clientConfigurations.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        const metadata = JaegerGrpcClient._createMetadata(
            clientConfigurations.authorizationHeader
        );
        this.metadata = metadata;
        this.queryService = JaegerGrpcClient._createQueryService(
            clientConfigurations.url,
            clientConfigurations.port || DEFAULT_PORT,
            metadata,
            this.requestTimeoutMs
        );
    }

    /** Strips scheme (http(s)://) and trailing slashes. Does not strip port. */
    private static _normalizeUrl(url: string): string {
        const schemaIdx: number = url.indexOf(URL_SCHEMA_SEPARATOR);
        if (schemaIdx >= 0) {
            url = url.substring(schemaIdx + URL_SCHEMA_SEPARATOR.length);
        }
        return url.replace(/\/+$/, '');
    }

    private static _isSecureUrl(url: string, port: number): boolean {
        if (url.startsWith(SECURE_URL_SCHEMA)) {
            return true;
        } else if (url.startsWith(INSECURE_URL_SCHEMA)) {
            return false;
        } else if (port === SECURE_URL_PORT) {
            return true;
        }
        return false;
    }

    private static _createQueryService(
        url: string,
        port: number,
        metadata: grpc.Metadata,
        requestTimeoutMs: number
    ): QueryService {
        const normalizedUrl: string = JaegerGrpcClient._normalizeUrl(url);
        const isSecureUrl: boolean = JaegerGrpcClient._isSecureUrl(url, port);
        const hasPort = /:\d+$/.test(normalizedUrl);
        const serverUrl: string = hasPort
            ? normalizedUrl
            : `${normalizedUrl}:${port}`;
        const Client: grpc.ServiceClientConstructor =
            grpc.makeGenericClientConstructor({}, GRPC_SERVICE_NAME);
        const client: grpc.Client = new Client(
            serverUrl,
            isSecureUrl
                ? grpc.credentials.createFromSecureContext(
                      tls.createSecureContext()
                  )
                : grpc.credentials.createInsecure()
        );
        return QueryService.create(
            JaegerGrpcClient._createRpcImpl(client, metadata, requestTimeoutMs)
        );
    }

    /**
     * RPC impl: uses server-stream for FindTraces/GetTrace (proto returns stream TracesData),
     * unary for the rest. Stream chunks are decoded with TracesData.decode; merged result
     * is passed as a TracesData instance so protobufjs does not try to decode it again.
     */
    private static _createRpcImpl(
        client: grpc.Client,
        metadata: grpc.Metadata,
        requestTimeoutMs: number
    ): (method: any, requestData: any, callback: any) => void {
        const methodPath = (name: string) => `/${GRPC_SERVICE_NAME}/${name}`;
        const passThrough = (arg: any) => arg;
        const STREAMING_METHODS = new Set(['FindTraces', 'GetTrace']);

        const deserializeTracesData = (buf: Buffer): TracesData =>
            TracesData.decode(buf);

        return (method: any, requestData: any, callback: any) => {
            const deadline = new Date(Date.now() + requestTimeoutMs);
            const path = methodPath(method.name);

            if (STREAMING_METHODS.has(method.name)) {
                const stream = client.makeServerStreamRequest(
                    path,
                    passThrough,
                    deserializeTracesData,
                    requestData,
                    metadata,
                    { deadline }
                );
                const chunks: TracesData[] = [];
                stream.on('data', (data: TracesData) => chunks.push(data));
                stream.on('end', () => {
                    const resourceSpans = chunks.flatMap(
                        (c) => c.resourceSpans || []
                    );
                    callback(null, TracesData.create({ resourceSpans }));
                });
                stream.on('error', (err: any) => callback(err));
                return;
            }

            client.makeUnaryRequest(
                path,
                passThrough,
                passThrough,
                requestData,
                metadata,
                { deadline },
                callback
            );
        };
    }

    private static _createMetadata(
        authorizationHeader?: string
    ): grpc.Metadata {
        const metadata: grpc.Metadata = new grpc.Metadata();
        if (authorizationHeader) {
            metadata.set('Authorization', authorizationHeader);
        }
        return metadata;
    }

    private _toTimestamp(timestamp?: number): ITimestamp | undefined {
        if (timestamp) {
            return {
                seconds: Math.floor(timestamp / 1000),
                nanos: (timestamp % 1000) * 1_000_000,
            } as ITimestamp;
        }
    }

    private _toDuration(duration?: number): IDuration | undefined {
        if (duration) {
            return {
                seconds: Math.floor(duration / 1000),
                nanos: (duration % 1000) * 1_000_000,
            } as IDuration;
        }
    }

    private _toOperation(op: IOperation): Operation {
        return {
            name: op.name,
            spanKind: toSpanKind(op.spanKind!),
        } as Operation;
    }

    private _toNumber(number?: number | Long | null): number | undefined {
        if (typeof number === 'number') {
            return number as number;
        } else if (number && typeof number === 'object') {
            return (number as Long).toNumber();
        } else if (!number) {
            return undefined;
        } else {
            return number;
        }
    }

    private _toAttribute(kv: IKeyValue): Attribute {
        return {
            key: kv.key,
            value: {
                stringValue: kv.value?.stringValue || undefined,
                boolValue: kv.value?.boolValue || undefined,
                intValue: this._toNumber(kv.value?.intValue),
                doubleValue: this._toNumber(kv.value?.doubleValue),
            },
        } as Attribute;
    }

    private _toResource(r: IResource): Resource {
        return {
            attributes:
                r.attributes && r.attributes.length
                    ? r.attributes.map((kv: IKeyValue) => this._toAttribute(kv))
                    : undefined,
            droppedAttributesCount: r.droppedAttributesCount || undefined,
        } as Resource;
    }

    private _toInstrumentationScope(
        is: IInstrumentationScope
    ): InstrumentationScope {
        return {
            name: is.name,
            version: is.version || undefined,
            attributes:
                is.attributes && is.attributes.length
                    ? is.attributes.map((kv: IKeyValue) =>
                          this._toAttribute(kv)
                      )
                    : undefined,
            droppedAttributesCount: is.droppedAttributesCount || undefined,
        } as InstrumentationScope;
    }

    private _toIdString(idString?: Uint8Array | null): string | null {
        if (idString && idString.length) {
            return Buffer.from(idString).toString('hex');
        }
        return '';
    }

    private _toTimeUnixNanoString(
        timeUnixNano?: number | Long | null
    ): string | undefined {
        if (timeUnixNano) {
            if (typeof timeUnixNano === 'number') {
                return timeUnixNano.toString();
            } else {
                return (timeUnixNano as Long).toString(10);
            }
        }
    }

    private _toEvent(e: IEvent): Event {
        return {
            name: e.name,
            timeUnixNano: this._toTimeUnixNanoString(e.timeUnixNano),
            attributes:
                e.attributes && e.attributes.length
                    ? e.attributes.map((kv: IKeyValue) => this._toAttribute(kv))
                    : undefined,
            droppedAttributesCount: e.droppedAttributesCount || undefined,
        } as Event;
    }

    private _toLink(l: ILink): Link {
        return {
            traceId: this._toIdString(l.traceId),
            spanId: this._toIdString(l.spanId),
            traceState: l.traceState || undefined,
            attributes:
                l.attributes && l.attributes.length
                    ? l.attributes.map((kv: IKeyValue) => this._toAttribute(kv))
                    : undefined,
            droppedAttributesCount: l.droppedAttributesCount || undefined,
        } as Link;
    }

    private _toStatus(s?: IStatus | null): Status | undefined {
        if (s) {
            return {
                code: toStatusCode(s.code?.valueOf()),
                message: s.message || undefined,
            } as Status;
        }
    }

    private _toSpan(s: ISpan): Span {
        return {
            traceId: this._toIdString(s.traceId),
            spanId: this._toIdString(s.spanId),
            traceState: s.traceState || undefined,
            parentSpanId: this._toIdString(s.parentSpanId),
            name: s.name,
            kind: toSpanKind(s.kind?.valueOf()),
            startTimeUnixNano: this._toTimeUnixNanoString(s.startTimeUnixNano),
            endTimeUnixNano: this._toTimeUnixNanoString(s.endTimeUnixNano),
            attributes:
                s.attributes && s.attributes.length
                    ? s.attributes.map((kv: IKeyValue) => this._toAttribute(kv))
                    : undefined,
            droppedAttributesCount: s.droppedAttributesCount || undefined,
            events:
                s.events && s.events.length
                    ? s.events?.map((e: IEvent) => this._toEvent(e))
                    : undefined,
            droppedEventsCount: s.droppedEventsCount || undefined,
            links:
                s.links && s.links.length
                    ? s.links?.map((l: ILink) => this._toLink(l))
                    : undefined,
            droppedLinksCount: s.droppedLinksCount || undefined,
            status: this._toStatus(s.status),
        } as Span;
    }

    private _toScopeSpans(ss: IScopeSpans): ScopeSpans {
        return {
            scope: this._toInstrumentationScope(ss.scope!),
            spans: ss.spans!.map((s: ISpan) => this._toSpan(s)),
            schemaUrl: ss.schemaUrl || undefined,
        } as ScopeSpans;
    }

    private _toResourceSpans(rs: IResourceSpans): ResourceSpans {
        return {
            resource: this._toResource(rs.resource!),
            scopeSpans: rs.scopeSpans!.map((ss: IScopeSpans) =>
                this._toScopeSpans(ss)
            ),
            schemaUrl: rs.schemaUrl || undefined,
        } as ResourceSpans;
    }

    /**
     * Maps gRPC/client errors to user-facing messages. DEADLINE_EXCEEDED becomes a timeout message;
     * UNIMPLEMENTED returns empty result; others are rethrown.
     */
    private _handleError<R>(err: any): R {
        if (err.code === grpc.status.UNIMPLEMENTED.valueOf()) {
            return {} as R;
        }
        if (err.code === grpc.status.DEADLINE_EXCEEDED.valueOf()) {
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
            const grpcRequest: IGetServicesRequest = {};
            const grpcResponse: IGetServicesResponse =
                await this.queryService.getServices(grpcRequest);
            return {
                services: grpcResponse.services,
            } as GetServicesResponse;
        } catch (err: any) {
            return this._handleError(err);
        }
    }

    async getOperations(
        request: GetOperationsRequest
    ): Promise<GetOperationsResponse> {
        try {
            const grpcRequest: IGetOperationsRequest = {
                service: request.service,
                spanKind: request.spanKind?.toString().toLowerCase(),
            };
            const grpcResponse: IGetOperationsResponse =
                await this.queryService.getOperations(grpcRequest);
            return {
                operations: grpcResponse.operations?.map((op: IOperation) =>
                    this._toOperation(op)
                ),
            } as GetOperationsResponse;
        } catch (err: any) {
            return this._handleError(err);
        }
    }

    async getTrace(request: GetTraceRequest): Promise<GetTraceResponse> {
        try {
            const grpcRequest: IGetTraceRequest = {
                traceId: request.traceId,
                startTime: this._toTimestamp(request.startTime),
                endTime: this._toTimestamp(request.endTime),
                rawTraces: request.rawTraces,
            };
            const grpcResponse: TracesData =
                await this.queryService.getTrace(grpcRequest);
            return {
                resourceSpans: grpcResponse.resourceSpans?.map(
                    (rs: IResourceSpans) => this._toResourceSpans(rs)
                ),
            } as GetTraceResponse;
        } catch (err: any) {
            return this._handleError(err);
        }
    }

    async findTraces(request: FindTracesRequest): Promise<FindTracesResponse> {
        const t0 = Date.now();
        try {
            const grpcRequest: IFindTracesRequest = {
                query: {
                    serviceName: request.query.serviceName,
                    operationName: request.query.operationName,
                    attributes: request.query.attributes,
                    startTimeMin: this._toTimestamp(request.query.startTimeMin),
                    startTimeMax: this._toTimestamp(request.query.startTimeMax),
                    durationMin: this._toDuration(request.query.durationMin),
                    durationMax: this._toDuration(request.query.durationMax),
                    searchDepth: request.query.searchDepth,
                    rawTraces: request.query.rawTraces,
                },
            };
            if (logger.isDebugEnabled()) {
                logger.debug(
                    '[gRPC] findTraces request',
                    logger.toJson({
                        serviceName: request.query.serviceName,
                        operationName: request.query.operationName,
                        startTimeMin: request.query.startTimeMin,
                        startTimeMinISO: request.query.startTimeMin
                            ? new Date(request.query.startTimeMin).toISOString()
                            : undefined,
                        startTimeMax: request.query.startTimeMax,
                        startTimeMaxISO: request.query.startTimeMax
                            ? new Date(request.query.startTimeMax).toISOString()
                            : undefined,
                        searchDepth: request.query.searchDepth,
                        durationMin: request.query.durationMin,
                        durationMax: request.query.durationMax,
                    })
                );
            }
            const grpcResponse: TracesData =
                await this.queryService.findTraces(grpcRequest);
            const count = grpcResponse.resourceSpans?.length ?? 0;
            if (logger.isDebugEnabled()) {
                logger.debug(
                    `[gRPC] findTraces response in ${Date.now() - t0}ms`,
                    'resourceSpans.length=',
                    count
                );
            }
            return {
                resourceSpans: grpcResponse.resourceSpans?.map(
                    (rs: IResourceSpans) => this._toResourceSpans(rs)
                ),
            } as FindTracesResponse;
        } catch (err: any) {
            if (logger.isDebugEnabled()) {
                logger.debug(
                    `[gRPC] findTraces error after ${Date.now() - t0}ms`,
                    err?.code ?? err?.name,
                    err?.message
                );
            }
            return this._handleError(err);
        }
    }
}
