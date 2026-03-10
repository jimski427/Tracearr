/**
 * User Devices Route
 *
 * GET /:id/devices - Get user's unique devices (aggregated from sessions)
 */

import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { userIdParamSchema } from '@tracearr/shared';
import { db } from '../../db/client.js';
import { serverUsers } from '../../db/schema.js';
import { queryUserDevices } from './queries.js';

export const devicesRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /:id/devices - Get user's unique devices (aggregated from sessions)
   */
  app.get('/:id/devices', { preHandler: [app.authenticate] }, async (request, reply) => {
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

    const devices = await queryUserDevices(db, id);
    return { data: devices };
  });
};
