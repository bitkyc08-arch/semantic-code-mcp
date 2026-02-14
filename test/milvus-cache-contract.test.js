import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
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
});
