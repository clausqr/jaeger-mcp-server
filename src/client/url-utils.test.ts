/**
 * Unit tests for URL/port parsing used by the HTTP client.
 */
import { describe, it, expect } from 'vitest';
import { parseUrlAndPort } from './url-utils';

describe('parseUrlAndPort', () => {
    it('adds http:// when no scheme and no config port', () => {
        const { url, port } = parseUrlAndPort('localhost');
        expect(url).toBe('http://localhost');
        expect(port).toBe(16686);
    });

    it('adds https:// when no scheme and config port 443', () => {
        const { url, port } = parseUrlAndPort('jaeger.example.com', 443);
        expect(url).toBe('https://jaeger.example.com');
        expect(port).toBe(443);
    });

    it('keeps existing scheme and uses default port for http', () => {
        const { url, port } = parseUrlAndPort('http://localhost');
        expect(url).toBe('http://localhost');
        expect(port).toBe(16686);
    });

    it('keeps existing scheme and uses 443 for https', () => {
        const { url, port } = parseUrlAndPort('https://jaeger.example.com');
        expect(url).toBe('https://jaeger.example.com');
        expect(port).toBe(443);
    });

    it('strips :port from URL and uses it', () => {
        const { url, port } = parseUrlAndPort('http://localhost:16764');
        expect(url).toBe('http://localhost');
        expect(port).toBe(16764);
    });

    it('strips :443 from https URL', () => {
        const { url, port } = parseUrlAndPort('https://jaeger.example.com:443');
        expect(url).toBe('https://jaeger.example.com');
        expect(port).toBe(443);
    });

    it('prefers explicit config port when URL has no embedded port', () => {
        const { url, port } = parseUrlAndPort('http://localhost', 9999);
        expect(url).toBe('http://localhost');
        expect(port).toBe(9999);
    });
});
