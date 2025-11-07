"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/__tests__'],
    moduleNameMapper: {
        '^vscode$': '<rootDir>/__tests__/mocks/vscode.ts', // VS Code API mock
    },
    setupFilesAfterEnv: ['<rootDir>/__tests__/setupTests.ts'],
    testPathIgnorePatterns: ['<rootDir>/__tests__/mocks/', '<rootDir>/__tests__/setupTests.ts'],
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true,
    testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/**.test.ts'],
};
exports.default = config;
//# sourceMappingURL=jest.config.js.map