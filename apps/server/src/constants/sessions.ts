/**
 * Session Query Constants
 */

import { sql } from 'drizzle-orm';

// Count unique plays — COALESCE(reference_id, id) collapses pause/resume chains into one play
export const PLAY_COUNT = sql<number>`count(distinct coalesce(reference_id, id))::int`;
