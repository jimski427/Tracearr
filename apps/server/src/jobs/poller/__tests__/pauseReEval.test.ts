/**
 * Pause Re-evaluation Tests
 *
 * Tests for reEvaluateRulesOnPauseChange:
 * - Only pause-duration-related rules are evaluated (no false positives)
 * - Violations are created when pause-duration rules match
 * - Application-level dedup prevents duplicate violations
 * - Side effect actions are executed
 * - Non-pause rules (concurrent_streams, etc.) are skipped
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RuleV2, Session } from '@tracearr/shared';
import type { PauseReEvalInput } from '../types.js';

// ============================================================================
// Module Mocks
// ============================================================================

// Mock DB client - the function uses db.transaction() with tx inside
const mockExecute = vi.fn();
const mockTxSelect = vi.fn();
const mockTxInsert = vi.fn();
const mockTxUpdate = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockValues = vi.fn();
const mockOnConflictDoNothing = vi.fn();
const mockReturning = vi.fn();
const mockSet = vi.fn();
const mockTransaction = vi.fn();

vi.mock('../../../db/client.js', () => ({
  db: {
    transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

// Mock schema tables - use importOriginal to preserve transitive exports
vi.mock('../../../db/schema.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
  };
});

// Mock rules engine
const mockEvaluateRulesAsync = vi.fn();
vi.mock('../../../services/rules/engine.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    evaluateRulesAsync: (...args: unknown[]) => mockEvaluateRulesAsync(...args),
  };
});

// Mock executors
const mockExecuteActions = vi.fn();
vi.mock('../../../services/rules/executors/index.js', () => ({
  executeActions: (...args: unknown[]) => mockExecuteActions(...args),
}));

// Mock v2Integration
const mockStoreActionResults = vi.fn();
vi.mock('../../../services/rules/v2Integration.js', () => ({
  storeActionResults: (...args: unknown[]) => mockStoreActionResults(...args),
}));

// Mock logger
vi.mock('../../../utils/logger.js', () => ({
  pollerLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  rulesLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock geoipService (needed by evaluators)
vi.mock('../../../services/geoip.js', () => ({
  geoipService: {
    isPrivateIP: (ip: string) =>
      ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('127.'),
  },
}));

// ============================================================================
// Helpers
// ============================================================================

function createMockExistingSession(
  overrides: Record<string, unknown> = {}
): PauseReEvalInput['existingSession'] {
  return {
    id: 'session-1',
    serverId: 'server-1',
    serverUserId: 'user-1',
    sessionKey: 'sk-1',
    externalSessionId: 'ext-1',
    state: 'paused',
    mediaType: 'movie',
    mediaTitle: 'Test Movie',
    grandparentTitle: null,
    seasonNumber: null,
    episodeNumber: null,
    year: 2024,
    thumbPath: null,
    ratingKey: 'rk-1',
    startedAt: new Date(),
    stoppedAt: null,
    durationMs: null,
    totalDurationMs: 7200000,
    progressMs: 600000,
    lastPausedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
    pausedDurationMs: 0,
    referenceId: null,
    watched: false,
    ipAddress: '192.168.1.100',
    geoCity: 'New York',
    geoRegion: 'NY',
    geoCountry: 'US',
    geoContinent: 'NA',
    geoPostal: '10001',
    geoLat: 40.7128,
    geoLon: -74.006,
    geoAsnNumber: 7922,
    geoAsnOrganization: 'Comcast',
    playerName: 'Player 1',
    deviceId: 'device-1',
    product: 'Plex Web',
    device: 'Chrome',
    platform: 'Web',
    quality: '1080p',
    isTranscode: false,
    videoDecision: 'directplay',
    audioDecision: 'directplay',
    bitrate: 20000,
    channelTitle: null,
    channelIdentifier: null,
    channelThumb: null,
    artistName: null,
    albumName: null,
    trackNumber: null,
    discNumber: null,
    sourceVideoCodec: 'hevc',
    sourceAudioCodec: 'ac3',
    sourceAudioChannels: 6,
    sourceVideoWidth: 3840,
    sourceVideoHeight: 2160,
    sourceVideoDetails: null,
    sourceAudioDetails: null,
    streamVideoCodec: null,
    streamAudioCodec: null,
    streamVideoDetails: null,
    streamAudioDetails: null,
    transcodeInfo: null,
    subtitleInfo: null,
    ...overrides,
  } as PauseReEvalInput['existingSession'];
}

function createPauseDurationRule(overrides: Partial<RuleV2> = {}): RuleV2 {
  return {
    id: 'rule-pause-1',
    name: 'Notify if Paused > 5 minutes',
    description: null,
    serverId: null,
    severity: 'warning',
    isActive: true,
    conditions: {
      groups: [
        { conditions: [{ field: 'paused_duration_minutes', operator: 'gt', value: 5 }] },
      ],
    },
    actions: {
      actions: [],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createConcurrentStreamsRule(overrides: Partial<RuleV2> = {}): RuleV2 {
  return {
    id: 'rule-concurrent-1',
    name: 'Max 2 Concurrent Streams',
    description: null,
    serverId: null,
    severity: 'warning',
    isActive: true,
    conditions: {
      groups: [{ conditions: [{ field: 'concurrent_streams', operator: 'gt', value: 2 }] }],
    },
    actions: {
      actions: [],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createDefaultInput(overrides: Partial<PauseReEvalInput> = {}): PauseReEvalInput {
  return {
    existingSession: createMockExistingSession(),
    server: { id: 'server-1', name: 'Test Plex', type: 'plex' },
    serverUser: {
      id: 'user-1',
      username: 'testuser',
      thumbUrl: null,
      identityName: null,
      trustScore: 100,
      sessionCount: 10,
      lastActivityAt: new Date(),
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    },
    activeRulesV2: [createPauseDurationRule(), createConcurrentStreamsRule()],
    activeSessions: [],
    recentSessions: [],
    ...overrides,
  };
}

function setupDbMockChain() {
  // Reset all mock chains
  mockTransaction.mockReset();
  mockExecute.mockReset();
  mockTxSelect.mockReset();
  mockTxInsert.mockReset();
  mockTxUpdate.mockReset();
  mockFrom.mockReset();
  mockWhere.mockReset();
  mockLimit.mockReset();
  mockValues.mockReset();
  mockOnConflictDoNothing.mockReset();
  mockReturning.mockReset();
  mockSet.mockReset();

  // tx.select().from().where().limit() → dedup check
  mockTxSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockLimit.mockResolvedValue([]); // No existing violations (default)

  // tx.insert().values().onConflictDoNothing().returning()
  mockTxInsert.mockReturnValue({ values: mockValues });
  mockValues.mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
  mockOnConflictDoNothing.mockReturnValue({ returning: mockReturning });
  mockReturning.mockResolvedValue([
    {
      id: 'violation-1',
      ruleId: 'rule-pause-1',
      serverUserId: 'user-1',
      sessionId: 'session-1',
      severity: 'warning',
      ruleType: null,
      data: {},
      createdAt: new Date(),
      acknowledgedAt: null,
    },
  ]);

  // tx.update().set().where()
  mockTxUpdate.mockReturnValue({ set: mockSet });
  mockSet.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

  // tx.execute() → advisory lock (no-op in tests)
  mockExecute.mockResolvedValue(undefined);

  // db.transaction(async (tx) => { ... }) - execute the callback with mock tx
  const mockTx = {
    execute: mockExecute,
    select: (...args: unknown[]) => mockTxSelect(...args),
    insert: (...args: unknown[]) => mockTxInsert(...args),
    update: (...args: unknown[]) => mockTxUpdate(...args),
  };
  mockTransaction.mockImplementation(async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
    return cb(mockTx);
  });
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  setupDbMockChain();
  mockExecuteActions.mockResolvedValue([]);
  mockStoreActionResults.mockResolvedValue(undefined);
});
describe('reEvaluateRulesOnPauseChange', () => {
  // Import dynamically after mocks are set up
  async function getFunction() {
    const mod = await import('../sessionLifecycle.js');
    return mod.reEvaluateRulesOnPauseChange;
  }

  describe('rule filtering', () => {
    it('only evaluates pause-duration rules, skipping concurrent_streams', async () => {
      const reEvaluateRulesOnPauseChange = await getFunction();

      mockEvaluateRulesAsync.mockResolvedValue([]);

      const input = createDefaultInput();
      await reEvaluateRulesOnPauseChange(input);

      // Should have been called with only the pause rule, not the concurrent streams rule
      expect(mockEvaluateRulesAsync).toHaveBeenCalledTimes(1);
      const [_baseContext, rules] = mockEvaluateRulesAsync.mock.calls[0] as [unknown, RuleV2[]];
      expect(rules).toHaveLength(1);
      expect(rules[0]?.id).toBe('rule-pause-1');
      expect(rules[0]?.name).toBe('Notify if Paused > 5 minutes');
    });

    it('returns empty array when no rules have pause-duration conditions', async () => {
      const reEvaluateRulesOnPauseChange = await getFunction();

      const input = createDefaultInput({
        activeRulesV2: [createConcurrentStreamsRule()],
      });

      const results = await reEvaluateRulesOnPauseChange(input);

      expect(results).toEqual([]);
      expect(mockEvaluateRulesAsync).not.toHaveBeenCalled();
    });

    it('returns empty array when there are no active rules', async () => {
      const reEvaluateRulesOnPauseChange = await getFunction();

      const input = createDefaultInput({ activeRulesV2: [] });

      const results = await reEvaluateRulesOnPauseChange(input);

      expect(results).toEqual([]);
      expect(mockEvaluateRulesAsync).not.toHaveBeenCalled();
    });
  });

  describe('violation creation', () => {
    it('creates violation when pause-duration rule matches', async () => {
      const reEvaluateRulesOnPauseChange = await getFunction();

      mockEvaluateRulesAsync.mockResolvedValue([
        {
          ruleId: 'rule-pause-1',
          ruleName: 'Notify if Paused > 5 minutes',
          matched: true,
          matchedGroups: [0],
          actions: [],
        },
      ]);

      const input = createDefaultInput();
      const results = await reEvaluateRulesOnPauseChange(input);

      expect(results).toHaveLength(1);
      expect(results[0]?.violation.id).toBe('violation-1');
      expect(mockTxInsert).toHaveBeenCalled();
    });

    it('includes pauseReEval marker in violation data', async () => {
      const reEvaluateRulesOnPauseChange = await getFunction();

      mockEvaluateRulesAsync.mockResolvedValue([
        {
          ruleId: 'rule-pause-1',
          ruleName: 'Notify if Paused > 5 minutes',
          matched: true,
          matchedGroups: [0],
          actions: [],
        },
      ]);

      const input = createDefaultInput();
      await reEvaluateRulesOnPauseChange(input);

      const insertValues = mockValues.mock.calls[0]?.[0] as Record<string, unknown>;
      const data = insertValues?.data as Record<string, unknown>;
      expect(data?.pauseReEval).toBe(true);
    });

    it('does not create violation when rule does not match', async () => {
      const reEvaluateRulesOnPauseChange = await getFunction();

      mockEvaluateRulesAsync.mockResolvedValue([
        {
          ruleId: 'rule-pause-1',
          ruleName: 'Notify if Paused > 5 minutes',
          matched: false,
          matchedGroups: [],
          actions: [],
        },
      ]);

      const input = createDefaultInput();
      const results = await reEvaluateRulesOnPauseChange(input);

      expect(results).toHaveLength(0);
      expect(mockTxInsert).not.toHaveBeenCalled();
    });
  });

  describe('deduplication', () => {
    it('skips violation creation when duplicate exists', async () => {
      const reEvaluateRulesOnPauseChange = await getFunction();

      mockEvaluateRulesAsync.mockResolvedValue([
        {
          ruleId: 'rule-pause-1',
          ruleName: 'Notify if Paused > 5 minutes',
          matched: true,
          matchedGroups: [0],
          actions: [],
        },
      ]);

      // Simulate existing violation found (dedup check returns result)
      mockLimit.mockResolvedValue([{ id: 'existing-violation-1' }]);

      const input = createDefaultInput();
      const results = await reEvaluateRulesOnPauseChange(input);

      // No new violations should be created
      expect(results).toHaveLength(0);
      expect(mockTxInsert).not.toHaveBeenCalled();
    });
  });

  describe('transaction safety', () => {
    it('acquires advisory lock before dedup check', async () => {
      const reEvaluateRulesOnPauseChange = await getFunction();

      mockEvaluateRulesAsync.mockResolvedValue([
        {
          ruleId: 'rule-pause-1',
          ruleName: 'Notify if Paused > 5 minutes',
          matched: true,
          matchedGroups: [0],
          actions: [],
        },
      ]);

      const input = createDefaultInput();
      await reEvaluateRulesOnPauseChange(input);

      // Transaction should be used
      expect(mockTransaction).toHaveBeenCalledTimes(1);

      // Advisory lock should be acquired (tx.execute called with SQL)
      expect(mockExecute).toHaveBeenCalledTimes(1);

      // Advisory lock should be called BEFORE the dedup select
      const executeOrder = mockExecute.mock.invocationCallOrder[0]!;
      const selectOrder = mockTxSelect.mock.invocationCallOrder[0]!;
      expect(executeOrder).toBeLessThan(selectOrder);
    });
  });

  describe('side effect actions', () => {
    it('executes actions alongside violation', async () => {
      const reEvaluateRulesOnPauseChange = await getFunction();

      mockEvaluateRulesAsync.mockResolvedValue([
        {
          ruleId: 'rule-pause-1',
          ruleName: 'Notify if Paused > 5 minutes',
          matched: true,
          matchedGroups: [0],
          actions: [{ type: 'send_notification' }],
        },
      ]);

      mockExecuteActions.mockResolvedValue([{ action: 'send_notification', success: true }]);

      const input = createDefaultInput({
        activeRulesV2: [
          createPauseDurationRule({ actions: { actions: [{ type: 'send_notification' }] } }),
        ],
      });
      await reEvaluateRulesOnPauseChange(input);

      expect(mockExecuteActions).toHaveBeenCalledTimes(1);
      expect(mockStoreActionResults).toHaveBeenCalledWith('violation-1', 'rule-pause-1', [
        { action: 'send_notification', success: true },
      ]);
    });
  });

  describe('context building', () => {
    it('builds session context from existing session fields', async () => {
      const reEvaluateRulesOnPauseChange = await getFunction();

      mockEvaluateRulesAsync.mockResolvedValue([]);

      const lastPausedAt = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
      const input = createDefaultInput({
        existingSession: createMockExistingSession({
          state: 'paused',
          lastPausedAt,
          pausedDurationMs: 0,
        }),
      });

      await reEvaluateRulesOnPauseChange(input);

      expect(mockEvaluateRulesAsync).toHaveBeenCalledTimes(1);
      const [baseContext] = mockEvaluateRulesAsync.mock.calls[0] as [{ session: Session }, RuleV2[]];

      // Session fields should come from existingSession
      expect(baseContext.session.id).toBe('session-1');
      expect(baseContext.session.serverId).toBe('server-1');
      expect(baseContext.session.serverUserId).toBe('user-1');
      expect(baseContext.session.state).toBe('paused');
      expect(baseContext.session.lastPausedAt).toEqual(lastPausedAt);
    });

    it('does NOT evaluate is_transcoding rules on pause change', async () => {
      const reEvaluateRulesOnPauseChange = await getFunction();

      mockEvaluateRulesAsync.mockResolvedValue([]);

      const transcodeRule: RuleV2 = {
        id: 'rule-transcode-1',
        name: 'Block Transcoding',
        description: null,
        serverId: null,
        severity: 'warning',
        isActive: true,
        conditions: {
          groups: [{ conditions: [{ field: 'is_transcoding', operator: 'eq', value: true }] }],
        },
        actions: { actions: [] },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const input = createDefaultInput({
        activeRulesV2: [transcodeRule, createPauseDurationRule()],
      });

      await reEvaluateRulesOnPauseChange(input);

      const [_ctx, rules] = mockEvaluateRulesAsync.mock.calls[0] as [unknown, RuleV2[]];
      expect(rules).toHaveLength(1);
      expect(rules[0]?.id).toBe('rule-pause-1');
    });
  });
});
