import { SpanKind, StatusCode } from './commons';

/** OpenTelemetry trace ID: exactly 32 hexadecimal characters. */
const TRACE_ID_REGEX = /^[0-9a-fA-F]{32}$/;

/**
 * Validates trace ID format (32 hex chars). Throws with a clear message if invalid.
 * Use at tool boundary so invalid IDs never reach the Jaeger client.
 */
export function validateTraceId(traceId: string): void {
    if (typeof traceId !== 'string' || !TRACE_ID_REGEX.test(traceId)) {
        throw new Error(
            `Invalid trace ID: must be 32 hexadecimal characters. Got: ${typeof traceId === 'string' ? JSON.stringify(traceId) : typeof traceId}`
        );
    }
}

const spanKindMapByString: { [key: string]: SpanKind } = {
    UNSPECIFIED: SpanKind.UNSPECIFIED,
    INTERNAL: SpanKind.INTERNAL,
    SERVER: SpanKind.SERVER,
    CLIENT: SpanKind.CLIENT,
    PRODUCER: SpanKind.PRODUCER,
    CONSUMER: SpanKind.CONSUMER,
};

const spanKindMapByNumber: { [key: number]: SpanKind } = {
    0: SpanKind.UNSPECIFIED,
    1: SpanKind.INTERNAL,
    2: SpanKind.SERVER,
    3: SpanKind.CLIENT,
    4: SpanKind.PRODUCER,
    5: SpanKind.CONSUMER,
};

const statusCodeMapByString: { [key: string]: StatusCode } = {
    UNSET: StatusCode.UNSET,
    OK: StatusCode.OK,
    ERROR: StatusCode.ERROR,
};

const statusCodeMapByNumber: { [key: number]: StatusCode } = {
    0: StatusCode.UNSET,
    1: StatusCode.OK,
    2: StatusCode.ERROR,
};

export function toSpanKind(
    spanKindAsStrOrNumber?: string | number
): SpanKind | undefined {
    if (spanKindAsStrOrNumber) {
        if (typeof spanKindAsStrOrNumber === 'number') {
            return spanKindMapByNumber[spanKindAsStrOrNumber as number];
        } else {
            return spanKindMapByString[spanKindAsStrOrNumber.toUpperCase()];
        }
    }
}

export function toStatusCode(
    statusCodeAsStrOrNumber?: string | number
): StatusCode | undefined {
    if (statusCodeAsStrOrNumber) {
        if (typeof statusCodeAsStrOrNumber === 'number') {
            return statusCodeMapByNumber[statusCodeAsStrOrNumber as number];
        } else {
            return statusCodeMapByString[statusCodeAsStrOrNumber.toUpperCase()];
        }
    }
}
