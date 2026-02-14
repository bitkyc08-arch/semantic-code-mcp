/**
 * Gemini embedder (OpenAI-compatible endpoint).
 *
 * Contract:
 *   async embed(text) -> { data: Float32Array, dims: [1, n] }
 * Metadata:
 *   embed.modelName, embed.dimension, embed.device
 */

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_MODEL = "gemini-embedding-001";
const DEFAULT_DIMENSIONS = 768;
const DEFAULT_BATCH_SIZE = 24;
const DEFAULT_BATCH_FLUSH_MS = 12;
const DEFAULT_MAX_RETRIES = 3;

function normalizeBaseUrl(baseUrl) {
  return (baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanErrorText(text) {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim().slice(0, 400);
}

function getRetryDelayMs(attempt) {
  // attempt starts at 1
  return Math.min(2000, 150 * (2 ** (attempt - 1)));
}

/**
 * Create a Gemini embedder with micro-batching and retry.
 */
export function createGeminiEmbedder(options = {}) {
  const apiKey =
    options.geminiApiKey ||
    options.apiKey ||
    process.env.SMART_CODING_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY;

  if (!apiKey || !String(apiKey).trim()) {
    throw new Error(
      "[Gemini] Missing API key. Set SMART_CODING_GEMINI_API_KEY (or GEMINI_API_KEY)."
    );
  }

  const modelName =
    options.geminiModel ||
    (typeof options.embeddingModel === "string" && options.embeddingModel.includes("gemini")
      ? options.embeddingModel
      : DEFAULT_MODEL);

  const dimension = clampInt(
    options.geminiDimensions ?? options.embeddingDimension ?? DEFAULT_DIMENSIONS,
    DEFAULT_DIMENSIONS,
    1,
    3072
  );

  const baseUrl = normalizeBaseUrl(options.geminiBaseURL);
  const endpoint = `${baseUrl}/embeddings`;
  const batchSize = clampInt(options.geminiBatchSize ?? DEFAULT_BATCH_SIZE, DEFAULT_BATCH_SIZE, 1, 128);
  const batchFlushMs = clampInt(
    options.geminiBatchFlushMs ?? DEFAULT_BATCH_FLUSH_MS,
    DEFAULT_BATCH_FLUSH_MS,
    0,
    1000
  );
  const maxRetries = clampInt(
    options.geminiMaxRetries ?? DEFAULT_MAX_RETRIES,
    DEFAULT_MAX_RETRIES,
    0,
    10
  );
  const verbose = options.verbose === true;

  const queue = [];
  let flushTimer = null;
  let inFlight = false;

  if (verbose) {
    console.error(
      `[Gemini] Provider ready: model=${modelName}, dim=${dimension}, batch=${batchSize}, flush=${batchFlushMs}ms`
    );
  }

  async function requestEmbeddings(inputTexts) {
    const body = {
      model: modelName,
      input: inputTexts
    };
    if (dimension > 0) {
      body.dimensions = dimension;
    }

    let attempt = 0;
    while (attempt <= maxRetries) {
      attempt += 1;
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${String(apiKey).trim()}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        });

        if (response.ok) {
          const payload = await response.json();
          if (!payload || !Array.isArray(payload.data)) {
            throw new Error("[Gemini] Invalid embeddings response shape");
          }
          return payload.data.map((row) => row?.embedding);
        }

        const errorText = cleanErrorText(await response.text());
        const shouldRetry = response.status === 429 || response.status >= 500;

        if (shouldRetry && attempt <= maxRetries) {
          await sleep(getRetryDelayMs(attempt));
          continue;
        }

        throw new Error(
          `[Gemini] Embedding request failed (${response.status}): ${errorText || "no response body"}`
        );
      } catch (error) {
        if (attempt > maxRetries) {
          throw error;
        }
        await sleep(getRetryDelayMs(attempt));
      }
    }

    throw new Error("[Gemini] Exhausted retries for embedding request");
  }

  async function flushNow() {
    if (inFlight || queue.length === 0) {
      return;
    }

    inFlight = true;
    const batch = queue.splice(0, batchSize);
    const batchTexts = batch.map((item) => item.text);

    try {
      const embeddings = await requestEmbeddings(batchTexts);
      if (!Array.isArray(embeddings) || embeddings.length !== batch.length) {
        throw new Error(
          `[Gemini] Embedding count mismatch. expected=${batch.length}, got=${embeddings?.length ?? 0}`
        );
      }

      for (let i = 0; i < batch.length; i += 1) {
        const vector = embeddings[i];
        if (!Array.isArray(vector)) {
          batch[i].reject(new Error("[Gemini] Missing embedding vector"));
          continue;
        }
        batch[i].resolve({
          data: Float32Array.from(vector),
          dims: [1, vector.length]
        });
      }
    } catch (error) {
      for (const item of batch) {
        item.reject(error);
      }
    } finally {
      inFlight = false;
      if (queue.length > 0) {
        queueMicrotask(flushNow);
      }
    }
  }

  function scheduleFlush() {
    if (queue.length >= batchSize) {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      queueMicrotask(flushNow);
      return;
    }

    if (flushTimer) {
      return;
    }

    flushTimer = setTimeout(() => {
      flushTimer = null;
      queueMicrotask(flushNow);
    }, batchFlushMs);
  }

  async function embed(text) {
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new Error("[Gemini] embed(text) requires a non-empty string");
    }

    return new Promise((resolve, reject) => {
      queue.push({ text, resolve, reject });
      scheduleFlush();
    });
  }

  embed.modelName = modelName;
  embed.dimension = dimension;
  embed.device = "api";
  embed.provider = "gemini";

  return embed;
}
