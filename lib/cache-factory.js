import { SQLiteCache } from "./sqlite-cache.js";
import { MilvusCache } from "./milvus-cache.js";

export function createCache(config) {
  // Keep cache provider selection centralized so index/search paths stay consistent.
  const provider = (config?.vectorStoreProvider || "sqlite").toLowerCase();

  if (provider === "milvus") {
    return new MilvusCache(config);
  }

  return new SQLiteCache(config);
}
