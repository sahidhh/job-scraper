// A job awaiting an AI score for longer than this is considered "stuck"
// (Phase 1 Task 6) -- surfaced for operator visibility, not auto-dropped
// (AD-14 already retries indefinitely; this just makes long waits visible).
// Default of 48h assumes the 2-hourly scrape/score cron (~24 missed
// attempts) -- override via SCORING_STUCK_THRESHOLD_HOURS.
export const SCORING_QUEUE_CONFIG = {
  stuckThresholdHours: parseInt(process.env.SCORING_STUCK_THRESHOLD_HOURS ?? "48", 10),
} as const;
