import { describe, expect, it, vi } from "vitest";
import { handleToolCall } from "../features/index-codebase.js";

function makeRequest(force = false) {
  return {
    params: {
      arguments: { force }
    }
  };
}

describe("index-codebase non-blocking contract", () => {
  it("should return accepted response when not indexing", async () => {
    const indexer = {
      isIndexing: false,
      startBackgroundIndexing: vi.fn(),
      getIndexingStatus: vi.fn()
    };

    const result = await handleToolCall(makeRequest(false), indexer);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.accepted).toBe(true);
    expect(parsed.status).toBe("started");
    expect(indexer.startBackgroundIndexing).toHaveBeenCalledWith(false);
  });

  it("should return rejected response when already indexing", async () => {
    const indexer = {
      isIndexing: true,
      startBackgroundIndexing: vi.fn(),
      getIndexingStatus: vi.fn().mockReturnValue({
        inProgress: true,
        totalFiles: 100,
        processedFiles: 42,
        percentage: 42
      })
    };

    const result = await handleToolCall(makeRequest(false), indexer);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.accepted).toBe(false);
    expect(parsed.status).toBe("rejected");
    expect(parsed.message).toContain("already in progress");
    expect(parsed.progress.percentage).toBe(42);
    expect(indexer.startBackgroundIndexing).not.toHaveBeenCalled();
  });

  it("should pass force parameter to startBackgroundIndexing", async () => {
    const indexer = {
      isIndexing: false,
      startBackgroundIndexing: vi.fn(),
      getIndexingStatus: vi.fn()
    };

    const result = await handleToolCall(makeRequest(true), indexer);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.accepted).toBe(true);
    expect(parsed.force).toBe(true);
    expect(indexer.startBackgroundIndexing).toHaveBeenCalledWith(true);
  });
});
