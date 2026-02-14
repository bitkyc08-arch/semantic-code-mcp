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

  it("should throw when API key is missing", () => {
    delete process.env.SMART_CODING_GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    expect(() =>
      createGeminiEmbedder({
        geminiApiKey: ""
      })
    ).toThrow(/Missing API key/);
  });

  it("should return Float32Array vector for a single text", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: [0.1, 0.2, 0.3] }]
      })
    });

    const embedder = createGeminiEmbedder({
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

    const embedder = createGeminiEmbedder({
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

    const embedder = createGeminiEmbedder({
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
