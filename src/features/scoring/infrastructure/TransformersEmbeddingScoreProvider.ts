import { pipeline } from "@huggingface/transformers";
import type { Job } from "@/features/jobs/domain/types";
import type { Resume } from "@/features/resume/domain/types";
import { cosineSimilarity, cosineSimilarityToScore } from "@/features/scoring/domain/embeddingSimilarity";
import type { EmbeddingScoreProvider } from "@/features/scoring/domain/EmbeddingScoreProvider";

const MODEL_ID = "onnx-community/all-MiniLM-L6-v2-ONNX";

// Feature-extraction pipeline signature we actually use -- narrower than
// @huggingface/transformers' full FeatureExtractionPipeline type so this
// can be mocked in tests without constructing a real Pipeline instance.
type Extractor = (text: string, options: { pooling: "mean"; normalize: true }) => Promise<{ data: ArrayLike<number> }>;

let extractorPromise: Promise<Extractor> | null = null;

function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL_ID) as unknown as Promise<Extractor>;
  }
  return extractorPromise;
}

async function embed(extractor: Extractor, text: string): Promise<number[]> {
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

// Local, offline stage-2 semantic signal (scoring.md §3, decisions.md
// AD-31) -- resume/job cosine similarity via a Transformers.js
// feature-extraction pipeline (all-MiniLM-L6-v2), run entirely on-device
// with no per-call API cost. The model is loaded once and cached across
// calls (jobhunt's scoring.py caches its sentence-transformers model the
// same way). Never throws -- any failure (no text to embed, model load
// error, embedding error) yields null and is logged here so the fallback
// to overlap-only scoring is visible (jobhunt bug #7), not silent.
export class TransformersEmbeddingScoreProvider implements EmbeddingScoreProvider {
  async score(input: { job: Job; resume: Resume }): Promise<number | null> {
    const resumeText = input.resume.parsedText.trim();
    const jobText = `${input.job.title}\n${input.job.description}`.trim();

    if (!resumeText || !jobText) {
      console.warn(
        `[embedding-score] job ${input.job.id}: empty resume or job text, nothing to embed; falling back to overlap-only`,
      );
      return null;
    }

    try {
      const extractor = await getExtractor();
      const [resumeVector, jobVector] = await Promise.all([embed(extractor, resumeText), embed(extractor, jobText)]);
      return cosineSimilarityToScore(cosineSimilarity(resumeVector, jobVector));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[embedding-score] job ${input.job.id}: embedding failed (${message}); falling back to overlap-only`);
      return null;
    }
  }
}
