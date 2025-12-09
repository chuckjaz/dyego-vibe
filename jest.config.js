export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  transformIgnorePatterns: [
    "node_modules/(?!binaryen)"
  ],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        isolatedModules: false,
        tsconfig: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          rootDir: '.',
        }
      },
    ],
  },
};
