import { describe, expect, it, vi } from "vitest";
import { HybridSearch } from "../features/hybrid-search.js";

function makeConfig(overrides = {}) {
  return {
    semanticWeight: 0.7,
    exactMatchBoost: 1.5,
    searchDirectory: "/tmp/workspace",
    ...overrides
  };
}

function makeEmbedder() {
  return vi.fn().mockResolvedValue({
    data: new Float32Array([0.1, 0.2, 0.3])
  });
}

describe("HybridSearch ANN path", () => {
  it("should use cache.searchByVector with expanded topK and return ranked results", async () => {
    const embedder = makeEmbedder();
    const cache = {
      searchByVector: vi.fn().mockResolvedValue([
        {
          file: "/tmp/workspace/src/auth.js",
          startLine: 1,
          endLine: 20,
          content: "export async function login() {}",
          score: 0.6
        },
        {
          file: "/tmp/workspace/src/other.js",
          startLine: 1,
          endLine: 20,
          content: "export async function fetchProfile() {}",
          score: 0.9
        }
      ]),
      getStats: vi.fn().mockResolvedValue({ totalChunks: 2, totalFiles: 2 })
    };
    const indexer = { indexingStatus: { inProgress: false, percentage: 0 } };
    const search = new HybridSearch(embedder, cache, makeConfig(), indexer);

    const { results, message } = await search.search("login", 3);

    expect(message).toBeNull();
    expect(cache.searchByVector).toHaveBeenCalledTimes(1);
    // max(3 * 5, 20) = 20
    expect(cache.searchByVector.mock.calls[0][1]).toBe(20);
    expect(results.length).toBe(2);
    // Exact-match boost should put login result on top despite lower base score.
    expect(results[0].file).toContain("auth.js");
  });

  it("should return no-index message when ANN results are empty and cache has no chunks", async () => {
    const embedder = makeEmbedder();
    const cache = {
      searchByVector: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockResolvedValue({ totalChunks: 0, totalFiles: 0 })
    };
    const search = new HybridSearch(
      embedder,
      cache,
      makeConfig(),
      { indexingStatus: { inProgress: false, percentage: 0 } }
    );

    const { results, message } = await search.search("anything", 3);
    expect(results).toEqual([]);
    expect(message).toContain("No code has been indexed yet");
  });

  it("should return indexing-progress message when ANN results are empty during indexing", async () => {
    const embedder = makeEmbedder();
    const cache = {
      searchByVector: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockResolvedValue({ totalChunks: 0, totalFiles: 0 })
    };
    const search = new HybridSearch(
      embedder,
      cache,
      makeConfig(),
      { indexingStatus: { inProgress: true, percentage: 35 } }
    );

    const { results, message } = await search.search("anything", 3);
    expect(results).toEqual([]);
    expect(message).toContain("Indexing in progress (35% complete)");
  });
});

