// A job awaiting an AI score for longer than this is considered "stuck"
// (Phase 1 Task 6) -- surfaced for operator visibility, not auto-dropped.
// Default of 48h assumes the 2-hourly scrape/score cron (~24 missed
// attempts) -- override via SCORING_STUCK_THRESHOLD_HOURS.
//
// maxAiRetries is the hard stop that "stuck" visibility never was (AD-51):
// a failed AI call is the ONLY skip reason that costs real tokens on every
// attempt, and before this cap `retry_count` was incremented and reported
// but never enforced, so a deterministically-failing job was paid for on
// every cron run forever. 3 leaves room for transient timeouts/5xx/rate
// limits while bounding the spend -- override via MAX_AI_RETRIES.
export const SCORING_QUEUE_CONFIG = {
  stuckThresholdHours: parseInt(process.env.SCORING_STUCK_THRESHOLD_HOURS ?? "48", 10),
  maxAiRetries: parseInt(process.env.MAX_AI_RETRIES ?? "3", 10),
} as const;
