import { SQLiteCache } from "./sqlite-cache.js";
import { MilvusCache } from "./milvus-cache.js";

export function createCache(config) {
  const provider = (config?.vectorStoreProvider || "sqlite").toLowerCase();

  if (provider === "milvus") {
    return new MilvusCache(config);
  }

  return new SQLiteCache(config);
}
