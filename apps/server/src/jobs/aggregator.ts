/**
 * Background job for refreshing dashboard statistics
 */

import { POLLING_INTERVALS, WS_EVENTS, TIME_MS, type DashboardStats } from '@tracearr/shared';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  playsCountSince,
  watchTimeSince,
  violationsCountSince,
  uniqueUsersSince,
} from '../db/prepared.js';
import { getCacheService, getPubSubService } from '../services/cache.js';
import { MEDIA_TYPE_SQL_FILTER } from '../constants/index.js';

let aggregatorInterval: NodeJS.Timeout | null = null;

export interface AggregatorConfig {
  enabled: boolean;
  intervalMs: number;
}

const defaultConfig: AggregatorConfig = {
  enabled: true,
  intervalMs: POLLING_INTERVALS.STATS_REFRESH,
};

/**
 * Refresh dashboard statistics and cache them
 */
async function refreshStats(): Promise<void> {
  try {
    // 1. Query active stream count from cache
    let activeStreams = 0;
    const cacheService = getCacheService();
    if (cacheService) {
      const activeSessions = await cacheService.getAllActiveSessions();
      activeStreams = activeSessions.length;
    }

    // 2. Query today's play count, watch time, violations, and active users
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
    const last24h = new Date(Date.now() - TIME_MS.DAY);
    const MIN_PLAY_DURATION_MS = 120000;

    const [todayPlaysResult, watchTimeResult, alertsResult, activeUsersResult, validatedPlaysResult] =
      await Promise.all([
        playsCountSince.execute({ since: todayStart }),
        watchTimeSince.execute({ since: todayStart }),
        violationsCountSince.execute({ since: last24h }),
        uniqueUsersSince.execute({ since: todayStart }),
        db.execute(sql`
          SELECT COUNT(DISTINCT COALESCE(reference_id, id))::int as count
          FROM sessions
          WHERE started_at::date = CURRENT_DATE
            AND duration_ms >= ${MIN_PLAY_DURATION_MS}
            ${MEDIA_TYPE_SQL_FILTER}
        `),
      ]);

    const stats: DashboardStats = {
      activeStreams,
      todaySessions: todayPlaysResult[0]?.count ?? 0,
      todayPlays: (validatedPlaysResult.rows[0] as { count: number })?.count ?? 0,
      watchTimeHours:
        Math.round((Number(watchTimeResult[0]?.totalMs ?? 0) / (1000 * 60 * 60)) * 10) / 10,
      alertsLast24h: alertsResult[0]?.count ?? 0,
      activeUsersToday: activeUsersResult[0]?.count ?? 0,
    };

    // 3. Cache the result
    if (cacheService) {
      await cacheService.setDashboardStats(stats);
    }

    // 4. Broadcast stats update via WebSocket
    const pubSubService = getPubSubService();
    if (pubSubService) {
      await pubSubService.publish(WS_EVENTS.STATS_UPDATED, stats);
    }

    console.log('Refreshing dashboard statistics...');
  } catch (error) {
    console.error('Stats aggregation error:', error);
  }
}

/**
 * Start the aggregator job
 */
export function startAggregator(config: Partial<AggregatorConfig> = {}): void {
  const mergedConfig = { ...defaultConfig, ...config };

  if (!mergedConfig.enabled) {
    console.log('Stats aggregator disabled');
    return;
  }

  if (aggregatorInterval) {
    console.log('Aggregator already running');
    return;
  }

  console.log(`Starting stats aggregator with ${mergedConfig.intervalMs}ms interval`);

  // Run immediately on start
  void refreshStats();

  // Then run on interval
  aggregatorInterval = setInterval(() => void refreshStats(), mergedConfig.intervalMs);
}

/**
 * Stop the aggregator job
 */
export function stopAggregator(): void {
  if (aggregatorInterval) {
    clearInterval(aggregatorInterval);
    aggregatorInterval = null;
    console.log('Stats aggregator stopped');
  }
}

/**
 * Force an immediate stats refresh
 */
export async function triggerRefresh(): Promise<void> {
  await refreshStats();
}
