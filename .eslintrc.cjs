module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    parserOptions: { project: ['./tsconfig.base.json'] },
    plugins: ['@typescript-eslint'],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended'
    ],
    env: { node: true, es2022: true },
    ignorePatterns: ['dist', 'node_modules'],
    rules: {
        '@typescript-eslint/explicit-module-boundary-types': 'off'
    }
};
