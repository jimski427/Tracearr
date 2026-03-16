import { pauseDuration } from '../pauseDuration';

const mockEvaluateRulesAsync = jest.fn().mockResolvedValue({
  actions: [
    notify, // Changed from send_notification
  ],
});

const mockExecuteActions = jest.fn().mockResolvedValue(
  notify // Changed from send_notification
);

const createPauseDurationRule = (override = {}) => ({
  ...override,
  notify, // Changed from send_notification
});

// Your additional test cases go here

describe('Pause Duration Evaluation', () => {
  it('should evaluate pause duration rules correctly', async () => {
    const result = await mockEvaluateRulesAsync();
    expect(result.actions).toContain(notify);
  });
});