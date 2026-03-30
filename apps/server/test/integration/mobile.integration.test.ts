// integration tests for mobile token refresh behavior

describe('Mobile Token Refresh', () => {
  // ... other test cases ...

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