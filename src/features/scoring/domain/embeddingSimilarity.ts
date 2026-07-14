/**
 * Cosine similarity between two equal-length vectors, in [-1, 1]. Returns 0
 * if either vector has zero magnitude (undefined direction).
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Maps a cosine similarity in [-1, 1] to a score in [0, 1] via the
 * continuous transform (sim + 1) / 2, applied to every value -- no branch
 * at zero (jobhunt bug #1: the reference implementation only remapped
 * negative similarities, leaving positive ones passed through raw, which
 * produced a discontinuity right at sim=0).
 */
export function cosineSimilarityToScore(sim: number): number {
  return Math.min(1, Math.max(0, (sim + 1) / 2));
}
