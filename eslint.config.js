// eslint.config.js
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },

  {
    files: ['**/*.ts', '**/*.d.ts'],
    extends: [...tseslint.configs.recommended, ...tseslint.configs.stylistic],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],

      // You asked for gentler rules:
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',

      // Allow empty stubs for lifecycle & callbacks
      '@typescript-eslint/no-empty-function': [
        'off',
        {
          allow: ['methods', 'arrowFunctions', 'functions'],
        },
      ],

      // Allow "aliasing this" if you keep it (or flip to 'warn')
      '@typescript-eslint/no-this-alias': 'off',

      // Common pattern: unused args prefixed with "_"
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Using .d.ts with import() types — just relax this in gentle mode
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
          disallowTypeAnnotations: false, // allow `import()` in .d.ts for now
        },
      ],
    },
  }

  // If you prefer, you can also carve out a specific override for .d.ts:
  // {
  //   files: ['**/*.d.ts'],
  //   rules: {
  //     '@typescript-eslint/consistent-type-imports': 'off',
  //   }
  // }
);
