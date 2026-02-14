/**
 * API embedder used by gemini/openai/openai-compatible/vertex providers.
 *
 * Contract:
 *   async embed(text) -> { data: Float32Array, dims: [1, n] }
 * Metadata:
 *   embed.modelName, embed.dimension, embed.device
 */

import { GoogleAuth } from "google-auth-library";

const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_GEMINI_MODEL = "gemini-embedding-001";
const DEFAULT_DIMENSIONS = 768;
const DEFAULT_BATCH_SIZE = 24;
const DEFAULT_BATCH_FLUSH_MS = 12;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "text-embedding-3-small";

function normalizeBaseUrl(baseUrl, fallback = DEFAULT_GEMINI_BASE_URL) {
  return (baseUrl || fallback).trim().replace(/\/+$/, "");
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

async function createVertexTokenProvider(options = {}) {
  const credentialsPath =
    options.googleApplicationCredentials ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const authOptions = {
    scopes: ["https://www.googleapis.com/auth/cloud-platform"]
  };
  if (credentialsPath && String(credentialsPath).trim()) {
    authOptions.keyFilename = String(credentialsPath).trim();
  }

  const auth = new GoogleAuth(authOptions);
  const client = await auth.getClient();
  return async function getAccessToken() {
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse?.token || tokenResponse;
    if (!token || !String(token).trim()) {
      throw new Error("[Vertex] Failed to obtain access token from Google credentials.");
    }
    return String(token).trim();
  };
}

/**
 * Create an API embedder with micro-batching and retry.
 */
export async function createGeminiEmbedder(options = {}) {
  const provider = (options.embeddingProvider || "gemini").toLowerCase();

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
  const dimension = clampInt(
    options.geminiDimensions ?? options.embeddingDimension ?? DEFAULT_DIMENSIONS,
    DEFAULT_DIMENSIONS,
    1,
    3072
  );

  let defaultModel = DEFAULT_GEMINI_MODEL;
  let endpoint = "";
  let logPrefix = "Gemini";
  let staticToken = "";
  let getAuthToken = async () => staticToken;

  if (provider === "openai") {
    logPrefix = "OpenAI";
    defaultModel = DEFAULT_OPENAI_MODEL;
    staticToken =
      options.openaiApiKey ||
      options.apiKey ||
      process.env.OPENAI_API_KEY ||
      "";
    endpoint = `${normalizeBaseUrl(DEFAULT_OPENAI_BASE_URL, DEFAULT_OPENAI_BASE_URL)}/embeddings`;
  } else if (provider === "openai-compatible") {
    logPrefix = "OpenAI-compatible";
    defaultModel = DEFAULT_OPENAI_MODEL;
    staticToken =
      options.embeddingApiKey ||
      options.apiKey ||
      process.env.SMART_CODING_EMBEDDING_API_KEY ||
      process.env.EMBEDDING_API_KEY ||
      "";
    const baseUrl =
      options.embeddingBaseURL ||
      process.env.SMART_CODING_EMBEDDING_BASE_URL ||
      process.env.EMBEDDING_BASE_URL;
    if (!baseUrl || !String(baseUrl).trim()) {
      throw new Error("[OpenAI-compatible] Missing base URL. Set SMART_CODING_EMBEDDING_BASE_URL.");
    }
    endpoint = `${normalizeBaseUrl(baseUrl, DEFAULT_OPENAI_BASE_URL)}/embeddings`;
  } else if (provider === "vertex") {
    logPrefix = "Vertex";
    defaultModel = DEFAULT_GEMINI_MODEL;
  } else {
    logPrefix = "Gemini";
    defaultModel = DEFAULT_GEMINI_MODEL;
    staticToken =
      options.geminiApiKey ||
      options.apiKey ||
      process.env.SMART_CODING_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      "";
    const baseUrl =
      options.geminiBaseURL ||
      process.env.SMART_CODING_GEMINI_BASE_URL ||
      process.env.GEMINI_BASE_URL ||
      DEFAULT_GEMINI_BASE_URL;
    endpoint = `${normalizeBaseUrl(baseUrl, DEFAULT_GEMINI_BASE_URL)}/embeddings`;
  }

  const isApiProvider = ["gemini", "openai", "openai-compatible", "vertex"].includes(provider);
  const configuredEmbeddingModel =
    typeof options.embeddingModel === "string" ? options.embeddingModel.trim() : "";
  const shouldIgnoreLocalDefaultModel =
    isApiProvider &&
    (!configuredEmbeddingModel || configuredEmbeddingModel === "nomic-ai/nomic-embed-text-v1.5");
  const modelName = shouldIgnoreLocalDefaultModel
    ? (options.geminiModel || defaultModel)
    : (configuredEmbeddingModel || options.geminiModel || defaultModel);

  if (provider === "vertex") {
    const project =
      options.vertexProject ||
      process.env.SMART_CODING_VERTEX_PROJECT ||
      process.env.VERTEX_PROJECT;
    const location =
      options.vertexLocation ||
      process.env.SMART_CODING_VERTEX_LOCATION ||
      process.env.VERTEX_LOCATION ||
      "us-central1";

    if (!project || !String(project).trim()) {
      throw new Error(
        "[Vertex] Missing project. Set SMART_CODING_VERTEX_PROJECT (or VERTEX_PROJECT)."
      );
    }

    getAuthToken = await createVertexTokenProvider(options);
    endpoint =
      `https://${location}-aiplatform.googleapis.com/v1/projects/${project}` +
      `/locations/${location}/publishers/google/models/${modelName}:predict`;
  } else {
    if (!staticToken || !String(staticToken).trim()) {
      throw new Error(
        `[${logPrefix}] Missing API key/token for embedding provider '${provider}'.`
      );
    }
    getAuthToken = async () => String(staticToken).trim();
  }

  const queue = [];
  let flushTimer = null;
  let inFlight = false;

  console.error(
    `[${logPrefix}] Provider init: provider=${provider} model=${modelName} endpoint=${endpoint} dim=${dimension}`
  );

  if (verbose) {
    console.error(
      `[${logPrefix}] Provider ready: model=${modelName}, dim=${dimension}, batch=${batchSize}, flush=${batchFlushMs}ms`
    );
  }

  async function requestEmbeddings(inputTexts) {
    const body = provider === "vertex"
      ? {
          instances: inputTexts.map((text) => ({ content: text })),
          ...(dimension > 0 ? { parameters: { outputDimensionality: dimension } } : {})
        }
      : {
          model: modelName,
          input: inputTexts,
          ...(dimension > 0 ? { dimensions: dimension } : {})
        };

    let attempt = 0;
    while (attempt <= maxRetries) {
      attempt += 1;
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await getAuthToken()}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        });

        if (response.ok) {
          const payload = await response.json();
          if (provider === "vertex") {
            if (!payload || !Array.isArray(payload.predictions)) {
              throw new Error("[Vertex] Invalid embeddings response shape");
            }
            return payload.predictions.map((prediction, idx) => {
              const vector = prediction?.embeddings?.values;
              if (!Array.isArray(vector)) {
                throw new Error(
                  `[Vertex] Invalid embeddings response at predictions[${idx}].embeddings.values`
                );
              }
              return vector;
            });
          }
          if (!payload || !Array.isArray(payload.data)) {
            throw new Error(`[${logPrefix}] Invalid embeddings response shape`);
          }
          return payload.data.map((row) => row?.embedding);
        }

        const errorText = cleanErrorText(await response.text());
        const shouldRetry = response.status === 429 || response.status >= 500;

        if (shouldRetry && attempt <= maxRetries) {
          await sleep(getRetryDelayMs(attempt));
          continue;
        }

        const nonRetryableError = new Error(
          `[${logPrefix}] Embedding request failed (${response.status}): ${errorText || "no response body"}`
        );
        nonRetryableError.retryable = false;
        throw nonRetryableError;
      } catch (error) {
        if (attempt > maxRetries || error?.retryable === false) {
          throw error;
        }
        await sleep(getRetryDelayMs(attempt));
      }
    }

    throw new Error(`[${logPrefix}] Exhausted retries for embedding request`);
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
          `[${logPrefix}] Embedding count mismatch. expected=${batch.length}, got=${embeddings?.length ?? 0}`
        );
      }

      for (let i = 0; i < batch.length; i += 1) {
        const vector = embeddings[i];
        if (!Array.isArray(vector)) {
          batch[i].reject(new Error(`[${logPrefix}] Missing embedding vector`));
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
      throw new Error(`[${logPrefix}] embed(text) requires a non-empty string`);
    }

    return new Promise((resolve, reject) => {
      queue.push({ text, resolve, reject });
      scheduleFlush();
    });
  }

  embed.modelName = modelName;
  embed.dimension = dimension;
  embed.device = "api";
  embed.provider = provider;

  return embed;
}
