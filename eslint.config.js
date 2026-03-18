import js from '@eslint/js';

export default [
    {
        files: ['public/js/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                console: 'readonly',
                document: 'readonly',
                window: 'readonly',
                state: 'readonly',
                supabase: 'readonly',
                pdfjsLib: 'readonly',
                localStorage: 'readonly',
                sessionStorage: 'readonly',
                performance: 'readonly',
                setTimeout: 'readonly',
                setInterval: 'readonly',
                clearTimeout: 'readonly',
                clearInterval: 'readonly',
                prompt: 'readonly',
                fetch: 'readonly',
                crypto: 'readonly',
                XMLHttpRequest: 'readonly',
                Blob: 'readonly',
                File: 'readonly',
                FileReader: 'readonly',
                FormData: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                navigator: 'readonly',
                location: 'readonly',
                history: 'readonly'
            }
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-console': 'warn',
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-var': 'error',
            'prefer-const': 'error',
            'eqeqeq': ['error', 'always'],
            'quotes': ['warn', 'single', { avoidEscape: true }],
            'semi': ['warn', 'always'],
            'comma-dangle': ['warn', 'never'],
            'indent': ['warn', 4],
            'no-multiple-empty-lines': ['warn', { max: 1 }],
            'no-trailing-spaces': 'warn',
            'object-curly-spacing': ['warn', 'always'],
            'array-bracket-spacing': ['warn', 'never'],
            'arrow-spacing': ['warn', { before: true, after: true }],
            'keyword-spacing': ['warn', { before: true, after: true }],
            'space-before-function-paren': ['warn', {
                anonymous: 'always',
                named: 'never',
                asyncArrow: 'always'
            }],
            'no-debugger': 'error'
        }
    },
    {
        ignores: ['node_modules/', '.git/', 'dist/', 'build/']
    }
];
