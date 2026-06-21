export const SOURCE_HEALTH_CONFIG = {
  disableAfterConsecutiveFailures: parseInt(
    process.env.SOURCE_DISABLE_THRESHOLD ?? "7",
    10,
  ),
  minimumHealthyCount: parseInt(
    process.env.MIN_HEALTHY_SOURCE_COUNT ?? "3",
    10,
  ),
} as const;
