import { describe, expect, it, vi } from "vitest";
import { StatusReporter } from "../features/get-status.js";

function makeConfig(overrides = {}) {
  return {
    searchDirectory: "/tmp/workspace",
    cacheDirectory: "/tmp/workspace/.smart-coding-cache",
    vectorStoreProvider: "milvus",
    embeddingProvider: "gemini",
    geminiModel: "gemini-embedding-001",
    geminiDimensions: 768,
    embeddingModel: "nomic-embed-text-v1.5",
    embeddingDimension: 128,
    chunkingMode: "smart",
    maxResults: 5,
    chunkSize: 25,
    semanticWeight: 0.7,
    exactMatchBoost: 1.5,
    workerThreads: 2,
    enableCache: true,
    milvusAddress: "http://127.0.0.1:19530",
    maxCpuPercent: 70,
    batchDelay: 100,
    maxWorkers: 4,
    ...overrides
  };
}

describe("StatusReporter", () => {
  it("should prefer cache.getStats() when available", async () => {
    const cache = {
      getStats: vi.fn().mockResolvedValue({ totalChunks: 12, totalFiles: 4 }),
      getVectorStore: vi.fn(() => {
        throw new Error("getVectorStore should not be called when getStats works");
      })
    };
    const indexer = { isIndexing: false, indexingStatus: null };
    const embedder = { modelName: "gemini-embedding-001", dimension: 768, device: "cpu" };
    const reporter = new StatusReporter(makeConfig(), cache, indexer, embedder);

    const status = await reporter.getStatus();

    expect(cache.getStats).toHaveBeenCalledTimes(1);
    expect(status.index.filesIndexed).toBe(4);
    expect(status.index.chunksCount).toBe(12);
    expect(status.index.status).toBe("ready");
    expect(status.cache.type).toBe("milvus");
  });

  it("should fall back to getVectorStore() when getStats fails", async () => {
    const cache = {
      getStats: vi.fn().mockRejectedValue(new Error("stats unavailable")),
      getVectorStore: vi.fn(() => [
        { file: "a.js" },
        { file: "a.js" },
        { file: "b.js" }
      ])
    };
    const indexer = { isIndexing: false, indexingStatus: null };
    const reporter = new StatusReporter(makeConfig(), cache, indexer, null);

    const status = await reporter.getStatus();

    expect(cache.getStats).toHaveBeenCalledTimes(1);
    expect(cache.getVectorStore).toHaveBeenCalledTimes(1);
    expect(status.index.filesIndexed).toBe(2);
    expect(status.index.chunksCount).toBe(3);
  });

  it("should report indexing status while in progress", async () => {
    const cache = {
      getStats: vi.fn().mockResolvedValue({ totalChunks: 0, totalFiles: 0 }),
      getVectorStore: vi.fn(() => [])
    };
    const indexer = {
      isIndexing: true,
      indexingStatus: {
        inProgress: true,
        totalFiles: 100,
        processedFiles: 20,
        percentage: 20
      }
    };
    const reporter = new StatusReporter(makeConfig(), cache, indexer, null);

    const status = await reporter.getStatus();
    expect(status.index.status).toBe("indexing");
    expect(status.index.progressiveIndexing.percentage).toBe(20);
  });
});

