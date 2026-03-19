import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlexClient } from '../client.js';

vi.mock('../../../../utils/http.js', () => ({
  fetchJson: vi.fn(),
  fetchText: vi.fn(),
  plexHeaders: vi.fn().mockReturnValue({ 'X-Plex-Token': 'test-token' }),
}));

import { fetchJson } from '../../../../utils/http.js';

const mockFetchJson = vi.mocked(fetchJson);

function makeClient() {
  return new PlexClient({ url: 'http://plex.local:32400', token: 'test-token' });
}

/** Helper: build a Plex API response with items that have updatedAt timestamps */
function makeItemsResponse(
  items: Array<{ ratingKey: string; title: string; updatedAt: number; addedAt?: number }>,
  totalSize?: number
) {
  return {
    MediaContainer: {
      totalSize: totalSize ?? items.length,
      size: items.length,
      Metadata: items.map((i) => ({
        ratingKey: i.ratingKey,
        title: i.title,
        type: 'movie',
        updatedAt: i.updatedAt,
        addedAt: i.addedAt ?? i.updatedAt - 86400,
        Media: [{ Part: [{ file: `/movies/${i.title}.mkv`, size: 1000000 }] }],
        Guid: [],
      })),
    },
  };
}

function emptyResponse() {
  return { MediaContainer: { totalSize: 0, size: 0, Metadata: [] } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PlexClient sort-based incremental sync', () => {
  describe('getLibraryItemsSince', () => {
    it('uses sort=updatedAt:desc in the query string', async () => {
      mockFetchJson.mockResolvedValue(emptyResponse());
      const client = makeClient();

      await client.getLibraryItemsSince('3', new Date('2024-06-01T00:00:00Z'));

      const url = mockFetchJson.mock.calls[0]?.[0] as string;
      expect(url).toContain('sort=updatedAt%3Adesc');
    });

    it('uses the /library/sections/{id}/all endpoint', async () => {
      mockFetchJson.mockResolvedValue(emptyResponse());
      const client = makeClient();

      await client.getLibraryItemsSince('42', new Date());

      const url = mockFetchJson.mock.calls[0]?.[0] as string;
      expect(url).toContain('/library/sections/42/all');
    });

    it('does NOT include addedAt>>= in the query', async () => {
      mockFetchJson.mockResolvedValue(emptyResponse());
      const client = makeClient();

      await client.getLibraryItemsSince('3', new Date());

      const url = mockFetchJson.mock.calls[0]?.[0] as string;
      expect(url).not.toContain('addedAt');
    });

    it('includes includeGuids=1', async () => {
      mockFetchJson.mockResolvedValue(emptyResponse());
      const client = makeClient();

      await client.getLibraryItemsSince('3', new Date());

      const url = mockFetchJson.mock.calls[0]?.[0] as string;
      expect(url).toContain('includeGuids=1');
    });

    it('returns only items with updatedAt >= since', async () => {
      const since = new Date('2024-06-01T00:00:00Z');
      const sinceUnix = Math.floor(since.getTime() / 1000);

      mockFetchJson.mockResolvedValue(
        makeItemsResponse([
          { ratingKey: '1', title: 'New', updatedAt: sinceUnix + 3600 },
          { ratingKey: '2', title: 'Exactly At', updatedAt: sinceUnix },
          { ratingKey: '3', title: 'Old', updatedAt: sinceUnix - 3600 },
        ])
      );

      const client = makeClient();
      const result = await client.getLibraryItemsSince('3', since);

      expect(result.items).toHaveLength(2);
      expect(result.totalCount).toBe(2);
      expect(result.items.map((i) => i.title)).toEqual(['New', 'Exactly At']);
    });

    it('stops paginating when cutoff is reached', async () => {
      const since = new Date('2024-06-01T00:00:00Z');
      const sinceUnix = Math.floor(since.getTime() / 1000);

      mockFetchJson
        .mockResolvedValueOnce(
          makeItemsResponse([
            { ratingKey: '1', title: 'A', updatedAt: sinceUnix + 7200 },
            { ratingKey: '2', title: 'B', updatedAt: sinceUnix + 3600 },
          ])
        )
        .mockResolvedValueOnce(
          makeItemsResponse([
            { ratingKey: '3', title: 'C', updatedAt: sinceUnix - 100 },
            { ratingKey: '4', title: 'D', updatedAt: sinceUnix - 200 },
          ])
        );

      const client = makeClient();
      const result = await client.getLibraryItemsSince('3', since);

      expect(result.items).toHaveLength(2);
      expect(mockFetchJson).toHaveBeenCalledTimes(2);
    });

    it('stops when API returns empty page', async () => {
      mockFetchJson.mockResolvedValue(emptyResponse());

      const client = makeClient();
      const result = await client.getLibraryItemsSince('3', new Date('2020-01-01'));

      expect(result.items).toHaveLength(0);
      expect(result.totalCount).toBe(0);
      expect(mockFetchJson).toHaveBeenCalledTimes(1);
    });

    it('handles items without updatedAt by treating them as too old', async () => {
      const since = new Date('2024-06-01T00:00:00Z');
      const sinceUnix = Math.floor(since.getTime() / 1000);

      mockFetchJson.mockResolvedValue({
        MediaContainer: {
          Metadata: [
            {
              ratingKey: '1',
              title: 'Has updatedAt',
              type: 'movie',
              updatedAt: sinceUnix + 3600,
              addedAt: sinceUnix,
              Media: [{ Part: [{ size: 1000 }] }],
              Guid: [],
            },
            {
              ratingKey: '2',
              title: 'No updatedAt',
              type: 'movie',
              addedAt: sinceUnix,
              Media: [{ Part: [{ size: 2000 }] }],
              Guid: [],
            },
          ],
        },
      });

      const client = makeClient();
      const result = await client.getLibraryItemsSince('3', since);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('Has updatedAt');
    });

    it('paginates correctly across multiple full pages', async () => {
      const since = new Date('2024-01-01T00:00:00Z');
      const sinceUnix = Math.floor(since.getTime() / 1000);

      const makePage = (startKey: number, updatedAt: number) =>
        makeItemsResponse(
          Array.from({ length: 100 }, (_, i) => ({
            ratingKey: String(startKey + i),
            title: `Item ${startKey + i}`,
            updatedAt,
          }))
        );

      mockFetchJson
        .mockResolvedValueOnce(makePage(1, sinceUnix + 30000))
        .mockResolvedValueOnce(makePage(101, sinceUnix + 20000))
        .mockResolvedValueOnce(makePage(201, sinceUnix + 10000))
        .mockResolvedValueOnce(
          makeItemsResponse([
            { ratingKey: '301', title: 'Last New', updatedAt: sinceUnix + 100 },
            { ratingKey: '302', title: 'First Old', updatedAt: sinceUnix - 100 },
          ])
        );

      const client = makeClient();
      const result = await client.getLibraryItemsSince('3', since);

      expect(result.items).toHaveLength(301);
      expect(mockFetchJson).toHaveBeenCalledTimes(4);

      const urls = mockFetchJson.mock.calls.map((c) => String(c[0]));
      expect(urls[0]).toContain('X-Plex-Container-Start=0');
      expect(urls[1]).toContain('X-Plex-Container-Start=100');
      expect(urls[2]).toContain('X-Plex-Container-Start=200');
      expect(urls[3]).toContain('X-Plex-Container-Start=300');
    });
  });

  describe('getLibraryLeavesSince', () => {
    it('uses the /allLeaves endpoint with sort=updatedAt:desc', async () => {
      mockFetchJson.mockResolvedValue(emptyResponse());
      const client = makeClient();

      await client.getLibraryLeavesSince('7', new Date());

      const url = mockFetchJson.mock.calls[0]?.[0] as string;
      expect(url).toContain('/library/sections/7/allLeaves');
      expect(url).toContain('sort=updatedAt%3Adesc');
    });

    it('does NOT include addedAt>>= in the query', async () => {
      mockFetchJson.mockResolvedValue(emptyResponse());
      const client = makeClient();

      await client.getLibraryLeavesSince('7', new Date());

      const url = mockFetchJson.mock.calls[0]?.[0] as string;
      expect(url).not.toContain('addedAt');
    });

    it('applies the same cutoff logic as getLibraryItemsSince', async () => {
      const since = new Date('2024-06-01T00:00:00Z');
      const sinceUnix = Math.floor(since.getTime() / 1000);

      mockFetchJson.mockResolvedValue(
        makeItemsResponse([
          { ratingKey: 'ep1', title: 'Recent Episode', updatedAt: sinceUnix + 1000 },
          { ratingKey: 'ep2', title: 'Old Episode', updatedAt: sinceUnix - 1000 },
        ])
      );

      const client = makeClient();
      const result = await client.getLibraryLeavesSince('7', since);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('Recent Episode');
    });
  });
});
