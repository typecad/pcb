import { beforeAll, afterAll } from 'vitest';

const originalExit = process.exit;

beforeAll(() => {
    process.exit = ((code?: number) => {
        throw new Error(`process.exit unexpectedly called with "${code}"`);
    }) as never;
});

afterAll(() => {
    process.exit = originalExit;
});
