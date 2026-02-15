/**
 * Integration-style tests: JaegerHttpClient against mocked HTTP (static Jaeger API responses).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { JaegerHttpClient } from './jaeger-http-client';

vi.mock('axios');

const mockGet = vi.mocked(axios.get);

/** Minimal Jaeger /api/v3/traces/:id response shape. */
const mockTraceResponse = {
    result: {
        resourceSpans: [
            {
                resource: { attributes: [] },
                scopeSpans: [
                    {
                        scope: { name: 'test' },
                        spans: [
                            {
                                traceId: 'a'.repeat(32),
                                spanId: 'b'.repeat(16),
                                name: 'test-span',
                                kind: 1,
                                startTimeUnixNano: '1000000000',
                                endTimeUnixNano: '2000000000',
                            },
                        ],
                    },
                ],
            },
        ],
    },
};

describe('JaegerHttpClient (integration-style)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('getTrace returns normalized resourceSpans from mock API', async () => {
        mockGet.mockResolvedValueOnce({ status: 200, data: mockTraceResponse });

        const client = new JaegerHttpClient({ url: 'http://localhost:16686' });
        const result = await client.getTrace({
            traceId: 'a'.repeat(32),
        });

        expect(mockGet).toHaveBeenCalledWith(
            expect.stringContaining('/api/v3/traces/' + 'a'.repeat(32)),
            expect.any(Object)
        );
        expect(result.resourceSpans).toHaveLength(1);
        expect(result.resourceSpans[0].scopeSpans[0].spans[0].name).toBe(
            'test-span'
        );
        expect(result.resourceSpans[0].scopeSpans[0].spans[0].kind).toBe(
            'internal'
        );
    });

    it('getTrace returns empty result on 404', async () => {
        mockGet.mockRejectedValueOnce({ response: { status: 404 } });

        const client = new JaegerHttpClient({ url: 'http://localhost:16686' });
        const result = await client.getTrace({
            traceId: 'c'.repeat(32),
        });

        expect(result.resourceSpans ?? []).toEqual([]);
    });
});
