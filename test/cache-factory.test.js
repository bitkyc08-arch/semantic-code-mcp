import { describe, it, expect } from "vitest";
import { createCache } from "../lib/cache-factory.js";
import { SQLiteCache } from "../lib/sqlite-cache.js";
import { MilvusCache } from "../lib/milvus-cache.js";

const baseConfig = {
  enableCache: true,
  cacheDirectory: ".smart-coding-cache",
  vectorStoreProvider: "sqlite",
  milvusAddress: ""
};

describe("Cache Factory", () => {
  it("should create SQLiteCache by default", () => {
    const cache = createCache({ ...baseConfig });
    expect(cache).toBeInstanceOf(SQLiteCache);
  });

  it("should create MilvusCache when provider is milvus", () => {
    const cache = createCache({ ...baseConfig, vectorStoreProvider: "milvus" });
    expect(cache).toBeInstanceOf(MilvusCache);
  });

  it("should fallback to SQLiteCache for unknown provider", () => {
    const cache = createCache({ ...baseConfig, vectorStoreProvider: "unknown" });
    expect(cache).toBeInstanceOf(SQLiteCache);
  });
});
