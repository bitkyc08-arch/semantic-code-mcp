/**
 * Tests for Gemini embedder (OpenAI-compatible endpoint wrapper).
 *
 * These tests are network-free and validate request shape, retry behavior,
 * and returned vector contract.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGeminiEmbedder } from "../lib/gemini-embedder.js";
import { createEmbedder } from "../lib/mrl-embedder.js";

describe("Gemini Embedder", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  it("should throw when API key is missing", async () => {
    delete process.env.SMART_CODING_GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    await expect(
      createGeminiEmbedder({
        geminiApiKey: ""
      })
    ).rejects.toThrow(/Missing API key/);
  });

  it("should return Float32Array vector for a single text", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: [0.1, 0.2, 0.3] }]
      })
    });

    const embedder = await createGeminiEmbedder({
      geminiApiKey: "test-key",
      geminiModel: "gemini-embedding-001",
      geminiDimensions: 3,
      geminiBatchFlushMs: 0
    });

    const output = await embedder("hello world");
    const vector = Array.from(output.data);
    expect(vector).toHaveLength(3);
    expect(vector[0]).toBeCloseTo(0.1, 5);
    expect(vector[1]).toBeCloseTo(0.2, 5);
    expect(vector[2]).toBeCloseTo(0.3, 5);
    expect(output.dims).toEqual([1, 3]);
    expect(embedder.modelName).toBe("gemini-embedding-001");
    expect(embedder.dimension).toBe(3);
    expect(embedder.device).toBe("api");
  });

  it("should call OpenAI-compatible embeddings endpoint with Bearer auth", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: [0.5, 0.25] }]
      })
    });

    const embedder = await createGeminiEmbedder({
      geminiApiKey: "k-123",
      geminiBaseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
    });

    await embedder("shape check");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, request] = global.fetch.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/embeddings");
    expect(request.method).toBe("POST");
    expect(request.headers.Authorization).toBe("Bearer k-123");
    expect(request.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(request.body);
    expect(body.model).toBeDefined();
    expect(body.input).toEqual(["shape check"]);
  });

  it("should retry on 5xx and then succeed", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => "service unavailable"
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.9, 0.8, 0.7] }]
        })
      });

    const embedder = await createGeminiEmbedder({
      geminiApiKey: "retry-key",
      geminiMaxRetries: 1,
      geminiBatchFlushMs: 0
    });

    const result = await embedder("retry test");
    const vector = Array.from(result.data);
    expect(vector).toHaveLength(3);
    expect(vector[0]).toBeCloseTo(0.9, 5);
    expect(vector[1]).toBeCloseTo(0.8, 5);
    expect(vector[2]).toBeCloseTo(0.7, 5);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("should retry on 429 and then succeed", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => "rate limit exceeded"
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.31, 0.32, 0.33] }]
        })
      });

    const embedder = await createGeminiEmbedder({
      geminiApiKey: "retry-429-key",
      geminiMaxRetries: 1,
      geminiBatchFlushMs: 0
    });

    const result = await embedder("retry 429 test");
    const vector = Array.from(result.data);
    expect(vector).toHaveLength(3);
    expect(vector[0]).toBeCloseTo(0.31, 5);
    expect(vector[1]).toBeCloseTo(0.32, 5);
    expect(vector[2]).toBeCloseTo(0.33, 5);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("should retry on transient network error and then succeed", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.41, 0.42] }]
        })
      });

    const embedder = await createGeminiEmbedder({
      geminiApiKey: "retry-network-key",
      geminiMaxRetries: 1,
      geminiBatchFlushMs: 0,
      geminiDimensions: 2
    });

    const result = await embedder("retry network test");
    const vector = Array.from(result.data);
    expect(vector[0]).toBeCloseTo(0.41, 5);
    expect(vector[1]).toBeCloseTo(0.42, 5);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("should fail after max retries on repeated 429", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "still rate limited"
    });

    const embedder = await createGeminiEmbedder({
      geminiApiKey: "retry-limit-key",
      geminiMaxRetries: 2,
      geminiBatchFlushMs: 0
    });

    await expect(embedder("retry limit test")).rejects.toThrow(/429/);
    // initial + 2 retries
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("should handle concurrent batch load with a transient 429", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (_url, request) => {
      callCount += 1;

      if (callCount === 1) {
        return {
          ok: false,
          status: 429,
          text: async () => "burst rate limit"
        };
      }

      const body = JSON.parse(request.body);
      const embeddings = body.input.map((_text, idx) => ({
        embedding: [idx + 0.1, idx + 0.2]
      }));

      return {
        ok: true,
        json: async () => ({ data: embeddings })
      };
    });

    const embedder = await createGeminiEmbedder({
      geminiApiKey: "batch-retry-key",
      geminiDimensions: 2,
      geminiBatchSize: 64,
      geminiBatchFlushMs: 5,
      geminiMaxRetries: 1
    });

    const inputs = Array.from({ length: 20 }, (_, i) => `batch-${i}`);
    const results = await Promise.all(inputs.map((text) => embedder(text)));

    expect(results).toHaveLength(20);
    expect(results[0].dims).toEqual([1, 2]);
    expect(results[19].dims).toEqual([1, 2]);
    // one failed attempt + one retry for the same batch
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("should not retry on 400 (non-retryable)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request"
    });

    const embedder = await createGeminiEmbedder({
      geminiApiKey: "bad-request-key",
      geminiMaxRetries: 3,
      geminiBatchFlushMs: 0
    });

    await expect(embedder("non retryable test")).rejects.toThrow(/400/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("createEmbedder should route to gemini provider when configured", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: [0.11, 0.22] }]
      })
    });

    const embedder = await createEmbedder({
      embeddingProvider: "gemini",
      geminiApiKey: "provider-key",
      geminiDimensions: 2
    });

    const result = await embedder("provider route");
    const vector = Array.from(result.data);
    expect(vector).toHaveLength(2);
    expect(vector[0]).toBeCloseTo(0.11, 5);
    expect(vector[1]).toBeCloseTo(0.22, 5);
    expect(embedder.provider).toBe("gemini");
  });
});
