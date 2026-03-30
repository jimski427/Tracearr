// integration tests for mobile token refresh behavior
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../../src/index.js';

// Mock the SSE manager so the test environment doesn't attempt to connect
// to a live Plex server (which is not available in CI at localhost:32400)
vi.mock('../../src/services/sseManager.js', () => ({
  sseManager: {
    initialize: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    addServer: vi.fn().mockResolvedValue(undefined),
    removeServer: vi.fn().mockResolvedValue(undefined),
    reconnect: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue([]),
    isInFallback: vi.fn().mockReturnValue(false),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  },
  SSEManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  })),
}));

let app: Awaited<ReturnType<typeof buildApp>>;
let validRefreshToken: string;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  // Obtain a valid refresh token by authenticating
  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/v1/mobile/auth',
    payload: {
      username: 'testuser',
      password: 'testpassword',
    },
  });

  // Fail fast with a clear message if login itself is broken
  expect(loginRes.statusCode, `Login failed with body: ${loginRes.body}`).toBe(200);

  validRefreshToken = loginRes.json().refreshToken;

  // Ensure the token was actually returned before running dependent tests
  expect(validRefreshToken, 'refreshToken missing from login response').toBeDefined();
});

afterAll(async () => {
  await app?.close();
});

describe('Mobile Token Refresh', () => {
  it('should refresh token and rotate refresh token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/mobile/refresh',
      payload: {
        refreshToken: validRefreshToken,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();

    // New refresh token should be different (rotation)
    expect(body.refreshToken).not.toBe(validRefreshToken);

    // New refresh token should work (proving rotation issued a valid token)
    const secondRes = await app.inject({
      method: 'POST',
      url: '/api/v1/mobile/refresh',
      payload: {
        refreshToken: body.refreshToken,
      },
    });

    expect(secondRes.statusCode).toBe(200);
    expect(secondRes.json().refreshToken).toBeDefined();
    // Third token should also be different from the second
    expect(secondRes.json().refreshToken).not.toBe(body.refreshToken);
  });
});