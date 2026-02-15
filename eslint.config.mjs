/**
 * ESLint 9 flat config. Run with: npm run lint:eslint
 */
import typescriptParser from '@typescript-eslint/parser';
import typescript from '@typescript-eslint/eslint-plugin';

export default [
    { ignores: ['dist/**', 'node_modules/**', 'src/generated/**'] },
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: typescriptParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
            },
            globals: {
                console: 'readonly',
                process: 'readonly',
                Buffer: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                module: 'readonly',
                require: 'readonly',
                exports: 'writable',
            },
        },
        plugins: {
            '@typescript-eslint': typescript,
        },
        rules: {
            ...typescript.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-empty-object-type': 'warn',
            '@typescript-eslint/no-require-imports': 'warn',
            '@typescript-eslint/no-unused-expressions': 'warn',
        },
    },
];
