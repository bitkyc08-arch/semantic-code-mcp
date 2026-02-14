import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MilvusCache } from "../lib/milvus-cache.js";

const tempDirs = [];

async function makeConfig(overrides = {}) {
  const cacheDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "smart-coding-milvus-cache-"));
  tempDirs.push(cacheDirectory);
  return {
    enableCache: true,
    cacheDirectory,
    embeddingProvider: "gemini",
    geminiDimensions: 768,
    embeddingDimension: 128,
    milvusCollection: "test_collection",
    milvusDatabase: "default",
    milvusAddress: "",
    milvusToken: "",
    ...overrides
  };
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe("Milvus Cache Contract", () => {
  it("should fail load when milvus address is missing", async () => {
    const config = await makeConfig({ milvusAddress: "" });
    const cache = new MilvusCache(config);

    await expect(cache.load()).rejects.toThrow("SMART_CODING_MILVUS_ADDRESS");
  });

  it("should keep cache contract for in-memory operations before load", async () => {
    const config = await makeConfig();
    const cache = new MilvusCache(config);

    cache.addBatchToStore([
      {
        file: "a.js",
        startLine: 1,
        endLine: 3,
        content: "const a = 1;",
        vector: new Array(768).fill(0.1)
      },
      {
        file: "b.js",
        startLine: 5,
        endLine: 9,
        content: "const b = 2;",
        vector: new Array(768).fill(0.2)
      }
    ]);

    expect(cache.getVectorStore()).toHaveLength(2);

    cache.removeFileFromStore("a.js");
    expect(cache.getVectorStore()).toHaveLength(1);
    expect(cache.getVectorStore()[0].file).toBe("b.js");
  });

  it("should manage file hashes with hash/mtime contract", async () => {
    const config = await makeConfig();
    const cache = new MilvusCache(config);

    cache.setFileHash("x.ts", "hash-1", 123);
    expect(cache.getFileHash("x.ts")).toBe("hash-1");
    expect(cache.getFileMtime("x.ts")).toBe(123);

    cache.deleteFileHash("x.ts");
    expect(cache.getFileHash("x.ts")).toBeNull();
    expect(cache.getFileMtime("x.ts")).toBeNull();
  });

  it("should search by vector using Milvus ANN params and map results", async () => {
    const config = await makeConfig();
    const cache = new MilvusCache(config);

    const mockSearch = vi.fn().mockResolvedValue({
      results: [
        {
          file: "src/auth.js",
          start_line: "10",
          end_line: "20",
          content: "export async function login() {}",
          score: 0.9321
        }
      ]
    });

    cache.client = { search: mockSearch };

    const rows = await cache.searchByVector(
      new Array(768).fill(0.01),
      7,
      'file == "src/auth.js"'
    );

    expect(mockSearch).toHaveBeenCalledTimes(1);
    const request = mockSearch.mock.calls[0][0];
    expect(request.collection_name).toBe("test_collection");
    expect(request.anns_field).toBe("vector");
    expect(request.metric_type).toBe("COSINE");
    expect(request.limit).toBe(7);
    expect(request.data).toHaveLength(768);
    expect(request.filter).toBe('file == "src/auth.js"');

    expect(rows).toEqual([
      {
        file: "src/auth.js",
        startLine: 10,
        endLine: 20,
        content: "export async function login() {}",
        score: 0.9321
      }
    ]);
  });

  it("should flatten nested result arrays from SDK response", async () => {
    const config = await makeConfig();
    const cache = new MilvusCache(config);

    cache.client = {
      search: vi.fn().mockResolvedValue({
        results: [
          [
            {
              file: "src/a.js",
              start_line: 1,
              end_line: 2,
              content: "const a = 1",
              score: 0.8
            }
          ]
        ]
      })
    };

    const rows = await cache.searchByVector(new Array(768).fill(0.02), 3);
    expect(rows).toHaveLength(1);
    expect(rows[0].file).toBe("src/a.js");
    expect(rows[0].score).toBe(0.8);
  });

  it("should throw when client is not initialized", async () => {
    const config = await makeConfig();
    const cache = new MilvusCache(config);

    await expect(cache.searchByVector(new Array(768).fill(0.01), 5)).rejects.toThrow(
      "Milvus client not initialized"
    );
  });

  it("should validate query vector dimension before search call", async () => {
    const config = await makeConfig();
    const cache = new MilvusCache(config);
    const mockSearch = vi.fn();
    cache.client = { search: mockSearch };

    await expect(cache.searchByVector([0.1, 0.2], 5)).rejects.toThrow(
      "Query vector dimension mismatch"
    );
    expect(mockSearch).not.toHaveBeenCalled();
  });
});
