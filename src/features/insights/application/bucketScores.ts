import type { ScoreHistogramBucket } from "@/features/insights/domain/types";

const BUCKET_LABELS: readonly string[] = [
  "0–10",
  "10–20",
  "20–30",
  "30–40",
  "40–50",
  "50–60",
  "60–70",
  "70–80",
  "80–90",
  "90–100",
];

export function bucketScores(scores: readonly number[]): ScoreHistogramBucket[] {
  const counts = new Array<number>(10).fill(0);

  for (const score of scores) {
    const index = Math.min(Math.floor(score * 10), 9);
    counts[index] = (counts[index] ?? 0) + 1;
  }

  return BUCKET_LABELS.map((bucket, i) => ({ bucket, count: counts[i] ?? 0 }));
}
