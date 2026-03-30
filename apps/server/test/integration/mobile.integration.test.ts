// integration tests for mobile token refresh behavior
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/index.js';

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

  validRefreshToken = loginRes.json().refreshToken;
});

afterAll(async () => {
  await app.close();
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
