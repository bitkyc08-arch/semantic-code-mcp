import { describe, expect, it, vi } from "vitest";
import { handleToolCall } from "../features/index-codebase.js";

function makeRequest(force = false) {
  return {
    params: {
      arguments: { force }
    }
  };
}

describe("index-codebase stats contract", () => {
  it("should use cache.getStats() when index result omits totals", async () => {
    const indexer = {
      indexAll: vi.fn().mockResolvedValue({
        skipped: false,
        filesProcessed: 0,
        chunksCreated: 0,
        message: "All files up to date"
      }),
      cache: {
        getStats: vi.fn().mockResolvedValue({ totalChunks: 11, totalFiles: 3 })
      }
    };

    const result = await handleToolCall(makeRequest(false), indexer);
    const text = result.content[0].text;

    expect(indexer.indexAll).toHaveBeenCalledWith(false);
    expect(indexer.cache.getStats).toHaveBeenCalledTimes(1);
    expect(text).toContain("Total files in index: 3");
    expect(text).toContain("Total code chunks: 11");
  });

  it("should fall back to getVectorStore() when getStats is unavailable", async () => {
    const indexer = {
      indexAll: vi.fn().mockResolvedValue({
        skipped: false,
        filesProcessed: 1,
        chunksCreated: 2
      }),
      cache: {
        getVectorStore: vi.fn(() => [
          { file: "a.js" },
          { file: "b.js" },
          { file: "b.js" }
        ])
      }
    };

    const result = await handleToolCall(makeRequest(true), indexer);
    const text = result.content[0].text;

    expect(indexer.cache.getVectorStore).toHaveBeenCalledTimes(1);
    expect(text).toContain("Total files in index: 2");
    expect(text).toContain("Total code chunks: 3");
  });
});

