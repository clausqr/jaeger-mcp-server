import { defineConfig } from 'vitest/config';
import * as path from 'path';

export default defineConfig({
    test: {
        glob: ['src/**/*.test.ts'],
        environment: 'node',
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
