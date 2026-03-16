import { describe, expect, it } from 'vitest';
import { buildCompositeKey } from '../stateTracker.js';

describe('buildCompositeKey', () => {
  describe('JF/Emby servers', () => {
    it('builds key from userId, deviceId, and ratingKey', () => {
      expect(
        buildCompositeKey({
          serverType: 'jellyfin',
          serverId: 'server-1',
          externalUserId: 'user-abc',
          deviceId: 'device-xyz',
          ratingKey: 'media-123',
          sessionKey: 'session-id-456',
        })
      ).toBe('server-1:user-abc:device-xyz:media-123');
    });

    it('falls back to sessionKey when deviceId is empty', () => {
      expect(
        buildCompositeKey({
          serverType: 'jellyfin',
          serverId: 'server-1',
          externalUserId: 'user-abc',
          deviceId: '',
          ratingKey: 'media-123',
          sessionKey: 'session-id-456',
        })
      ).toBe('server-1:user-abc:session-id-456:media-123');
    });

    it('falls back to sessionKey when deviceId is null', () => {
      expect(
        buildCompositeKey({
          serverType: 'emby',
          serverId: 'server-1',
          externalUserId: 'user-abc',
          deviceId: null,
          ratingKey: 'media-123',
          sessionKey: 'session-id-456',
        })
      ).toBe('server-1:user-abc:session-id-456:media-123');
    });

    it('works for emby server type', () => {
      expect(
        buildCompositeKey({
          serverType: 'emby',
          serverId: 'server-2',
          externalUserId: 'user-def',
          deviceId: 'device-abc',
          ratingKey: 'media-789',
          sessionKey: 'session-id-000',
        })
      ).toBe('server-2:user-def:device-abc:media-789');
    });

    it('handles null ratingKey', () => {
      expect(
        buildCompositeKey({
          serverType: 'jellyfin',
          serverId: 'server-1',
          externalUserId: 'user-abc',
          deviceId: 'device-xyz',
          ratingKey: null,
          sessionKey: 'session-id',
        })
      ).toBe('server-1:user-abc:device-xyz:');
    });
  });

  describe('Plex servers', () => {
    it('uses serverId:sessionKey format', () => {
      expect(
        buildCompositeKey({
          serverType: 'plex',
          serverId: 'server-3',
          externalUserId: 'user-ghi',
          deviceId: 'device-plex',
          ratingKey: 'media-456',
          sessionKey: 'plex-session-key',
        })
      ).toBe('server-3:plex-session-key');
    });
  });
});
