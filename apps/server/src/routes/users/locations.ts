/**
 * User Locations Route
 *
 * GET /:id/locations - Get user's unique locations (aggregated from sessions)
 */

import type { FastifyPluginAsync } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { userIdParamSchema, type UserLocation } from '@tracearr/shared';
import { db } from '../../db/client.js';
import { serverUsers } from '../../db/schema.js';

export const locationsRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /:id/locations - Get user's unique locations (aggregated from sessions)
   */
  app.get('/:id/locations', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = userIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.badRequest('Invalid user ID');
    }

    const { id } = params.data;
    const authUser = request.user;

    // Verify server user exists and access
    const serverUserRows = await db
      .select()
      .from(serverUsers)
      .where(eq(serverUsers.id, id))
      .limit(1);

    const serverUser = serverUserRows[0];
    if (!serverUser) {
      return reply.notFound('User not found');
    }

    if (!authUser.serverIds.includes(serverUser.serverId)) {
      return reply.forbidden('You do not have access to this user');
    }

    // Deduplicate to one row per play, then aggregate by location.
    // Each play is assigned to its most recent segment's location.
    const locationResult = await db.execute(sql`
      WITH plays AS (
        SELECT DISTINCT ON (COALESCE(reference_id, id))
          geo_city, geo_region, geo_country, geo_lat, geo_lon,
          ip_address, started_at
        FROM sessions
        WHERE server_user_id = ${id}
        ORDER BY COALESCE(reference_id, id), started_at DESC
      )
      SELECT
        geo_city AS city,
        geo_region AS region,
        geo_country AS country,
        geo_lat AS lat,
        geo_lon AS lon,
        count(*)::int AS session_count,
        max(started_at) AS last_seen_at,
        array_agg(DISTINCT ip_address) AS ip_addresses
      FROM plays
      GROUP BY geo_city, geo_region, geo_country, geo_lat, geo_lon
      ORDER BY max(started_at) DESC
    `);

    const locations: UserLocation[] = (
      locationResult.rows as {
        city: string | null;
        region: string | null;
        country: string | null;
        lat: number | null;
        lon: number | null;
        session_count: number;
        last_seen_at: Date;
        ip_addresses: string[];
      }[]
    ).map((loc) => ({
      city: loc.city,
      region: loc.region,
      country: loc.country,
      lat: loc.lat,
      lon: loc.lon,
      sessionCount: loc.session_count,
      lastSeenAt: loc.last_seen_at,
      ipAddresses: loc.ip_addresses ?? [],
    }));

    return { data: locations };
  });
};
