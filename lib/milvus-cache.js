import fs from "fs/promises";
import path from "path";
import { DataType, MetricType, MilvusClient } from "@zilliz/milvus2-sdk-node";

const DEFAULT_COLLECTION = "smart_coding_embeddings";
const DEFAULT_MAX_CONTENT_LENGTH = 65535;
const DEFAULT_QUERY_BATCH_SIZE = 1000;

function escapeFilterString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parseIntSafe(value, fallback = 0) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export class MilvusCache {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.vectorStore = [];
    this.fileHashes = new Map();
    this.isSaving = false;
    this.hashesDirty = false;
    this.lastWriteError = null;
    this.writeQueue = Promise.resolve();
    this.hashPath = path.join(config.cacheDirectory, "file-hashes.json");
    this.collectionName = config.milvusCollection || DEFAULT_COLLECTION;
    this.dimension = this.resolveDimension(config);
  }

  resolveDimension(config) {
    const provider = (config.embeddingProvider || "local").toLowerCase();
    const candidate =
      provider === "gemini" ? config.geminiDimensions : config.embeddingDimension;
    const dim = Number(candidate);
    if (Number.isInteger(dim) && dim > 0) return dim;
    return provider === "gemini" ? 768 : 128;
  }

  getRequestBase() {
    const base = {};
    if (this.config.milvusDatabase) {
      base.db_name = this.config.milvusDatabase;
    }
    return base;
  }

  enqueueWrite(task, label = "write") {
    this.writeQueue = this.writeQueue
      .then(async () => {
        await task();
      })
      .catch((error) => {
        this.lastWriteError = error;
        console.error(`[Cache] Milvus ${label} failed: ${error.message}`);
      });
    return this.writeQueue;
  }

  async waitForWrites() {
    await this.writeQueue;
    if (this.lastWriteError) {
      const error = this.lastWriteError;
      this.lastWriteError = null;
      throw error;
    }
  }

  validateConfig() {
    const address = this.config?.milvusAddress?.trim();
    if (!address) {
      throw new Error(
        "[Cache] Milvus provider selected but SMART_CODING_MILVUS_ADDRESS is not set."
      );
    }
    return address;
  }

  async load() {
    if (!this.config.enableCache) return;

    this.validateConfig();
    this.dimension = this.resolveDimension(this.config);
    this.collectionName = this.config.milvusCollection || DEFAULT_COLLECTION;
    this.hashPath = path.join(this.config.cacheDirectory, "file-hashes.json");

    await fs.mkdir(this.config.cacheDirectory, { recursive: true });
    await this.loadFileHashes();

    this.client = new MilvusClient({
      address: this.config.milvusAddress,
      token: this.config.milvusToken || undefined,
      database: this.config.milvusDatabase || undefined
    });

    await this.ensureCollection();
    this.vectorStore = await this.fetchAllVectors();

    console.error(
      `[Cache] Loaded Milvus cache: ${this.vectorStore.length} embeddings from ${this.fileHashes.size} files`
    );
  }

  async ensureCollection() {
    const hasRes = await this.client.hasCollection({
      collection_name: this.collectionName,
      ...this.getRequestBase()
    });
    const exists = Boolean(hasRes?.value);

    if (!exists) {
      await this.client.createCollection({
        collection_name: this.collectionName,
        description: "smart-coding-mcp embeddings cache",
        fields: [
          {
            name: "id",
            data_type: DataType.Int64,
            is_primary_key: true,
            autoID: true
          },
          {
            name: "file",
            data_type: DataType.VarChar,
            max_length: 4096
          },
          {
            name: "start_line",
            data_type: DataType.Int64
          },
          {
            name: "end_line",
            data_type: DataType.Int64
          },
          {
            name: "content",
            data_type: DataType.VarChar,
            max_length: DEFAULT_MAX_CONTENT_LENGTH
          },
          {
            name: "vector",
            data_type: DataType.FloatVector,
            dim: this.dimension
          }
        ],
        enable_dynamic_field: false,
        ...this.getRequestBase()
      });

      try {
        await this.client.createIndex({
          collection_name: this.collectionName,
          field_name: "vector",
          index_type: "AUTOINDEX",
          metric_type: MetricType.COSINE,
          ...this.getRequestBase()
        });
      } catch (error) {
        console.error(`[Cache] Milvus index create warning: ${error.message}`);
      }
    }

    await this.client.loadCollection({
      collection_name: this.collectionName,
      ...this.getRequestBase()
    });
  }

  async fetchAllVectors() {
    const rows = [];
    let offset = 0;

    while (true) {
      const res = await this.client.query({
        collection_name: this.collectionName,
        filter: "id >= 0",
        output_fields: ["file", "start_line", "end_line", "content", "vector"],
        limit: DEFAULT_QUERY_BATCH_SIZE,
        offset,
        ...this.getRequestBase()
      });

      const batch = Array.isArray(res?.data) ? res.data : [];
      if (batch.length === 0) break;

      for (const row of batch) {
        if (!row?.file || !Array.isArray(row?.vector)) continue;
        rows.push({
          file: String(row.file),
          startLine: parseIntSafe(row.start_line, 0),
          endLine: parseIntSafe(row.end_line, 0),
          content: String(row.content || ""),
          vector: row.vector.map((value) => Number(value))
        });
      }

      if (batch.length < DEFAULT_QUERY_BATCH_SIZE) break;
      offset += batch.length;
    }

    return rows;
  }

  normalizeChunk(chunk) {
    if (!chunk || !chunk.file) return null;

    const rawVector = Array.isArray(chunk.vector)
      ? chunk.vector
      : Array.from(chunk.vector || []);
    if (rawVector.length !== this.dimension) {
      return null;
    }

    return {
      file: String(chunk.file),
      start_line: parseIntSafe(chunk.startLine, 0),
      end_line: parseIntSafe(chunk.endLine, 0),
      content: String(chunk.content || "").slice(0, DEFAULT_MAX_CONTENT_LENGTH),
      vector: rawVector.map((value) => Number(value))
    };
  }

  getVectorStore() {
    return this.vectorStore;
  }

  setVectorStore(store) {
    const normalizedStore = [];
    for (const chunk of Array.isArray(store) ? store : []) {
      const normalized = this.normalizeChunk(chunk);
      if (!normalized) continue;
      normalizedStore.push({
        file: normalized.file,
        startLine: normalized.start_line,
        endLine: normalized.end_line,
        content: normalized.content,
        vector: normalized.vector
      });
    }

    this.vectorStore = normalizedStore;

    this.enqueueWrite(async () => {
      if (!this.client) return;
      await this.client.delete({
        collection_name: this.collectionName,
        filter: "id >= 0",
        ...this.getRequestBase()
      });

      if (normalizedStore.length === 0) return;
      await this.client.insert({
        collection_name: this.collectionName,
        data: normalizedStore.map((row) => ({
          file: row.file,
          start_line: row.startLine,
          end_line: row.endLine,
          content: row.content,
          vector: row.vector
        })),
        ...this.getRequestBase()
      });
    }, "setVectorStore");
  }

  addToStore(chunk) {
    this.addBatchToStore([chunk]);
  }

  addBatchToStore(chunks) {
    if (!Array.isArray(chunks) || chunks.length === 0) return;

    const normalizedBatch = [];
    const localBatch = [];

    for (const chunk of chunks) {
      const normalized = this.normalizeChunk(chunk);
      if (!normalized) continue;
      normalizedBatch.push(normalized);
      localBatch.push({
        file: normalized.file,
        startLine: normalized.start_line,
        endLine: normalized.end_line,
        content: normalized.content,
        vector: normalized.vector
      });
    }

    if (normalizedBatch.length === 0) return;
    this.vectorStore.push(...localBatch);

    this.enqueueWrite(async () => {
      if (!this.client) return;
      await this.client.insert({
        collection_name: this.collectionName,
        data: normalizedBatch,
        ...this.getRequestBase()
      });
    }, "insert");
  }

  removeFileFromStore(file) {
    this.vectorStore = this.vectorStore.filter((chunk) => chunk.file !== file);

    const escaped = escapeFilterString(file);
    this.enqueueWrite(async () => {
      if (!this.client) return;
      await this.client.delete({
        collection_name: this.collectionName,
        filter: `file == "${escaped}"`,
        ...this.getRequestBase()
      });
    }, "deleteByFile");
  }

  getFileHash(file) {
    const entry = this.fileHashes.get(file);
    if (typeof entry === "string") return entry;
    return entry?.hash || null;
  }

  getFileMtime(file) {
    const entry = this.fileHashes.get(file);
    return entry?.mtime ?? null;
  }

  setFileHash(file, hash, mtime = null) {
    this.fileHashes.set(file, { hash, mtime });
    this.hashesDirty = true;
  }

  deleteFileHash(file) {
    this.fileHashes.delete(file);
    this.hashesDirty = true;
  }

  getAllFileHashes() {
    return this.fileHashes;
  }

  clearAllFileHashes() {
    this.fileHashes = new Map();
    this.hashesDirty = true;
  }

  async loadFileHashes() {
    try {
      const raw = await fs.readFile(this.hashPath, "utf-8");
      const parsed = JSON.parse(raw);
      this.fileHashes = new Map(Object.entries(parsed || {}));
      this.hashesDirty = false;
    } catch {
      this.fileHashes = new Map();
      this.hashesDirty = false;
    }
  }

  async saveFileHashes() {
    if (!this.hashesDirty) return;
    await fs.mkdir(this.config.cacheDirectory, { recursive: true });
    await fs.writeFile(
      this.hashPath,
      JSON.stringify(Object.fromEntries(this.fileHashes), null, 2),
      "utf-8"
    );
    this.hashesDirty = false;
  }

  async save() {
    if (!this.config.enableCache) return;

    this.isSaving = true;
    try {
      await this.waitForWrites();
      if (this.client) {
        await this.client.flush({
          collection_names: [this.collectionName],
          ...this.getRequestBase()
        });
      }
      await this.saveFileHashes();
    } finally {
      this.isSaving = false;
    }
  }

  async saveIncremental() {
    if (!this.config.enableCache) return;
    await this.waitForWrites();
    await this.saveFileHashes();
  }

  async resetForFullReindex() {
    this.setVectorStore([]);
    this.clearAllFileHashes();
    await this.save();
  }

  async clear() {
    if (!this.config.enableCache) return;

    await this.waitForWrites();

    if (this.client) {
      try {
        await this.client.dropCollection({
          collection_name: this.collectionName,
          ...this.getRequestBase()
        });
      } catch (error) {
        console.error(`[Cache] Milvus drop collection warning: ${error.message}`);
      }

      await this.ensureCollection();
    }

    this.vectorStore = [];
    this.fileHashes = new Map();
    this.hashesDirty = true;
    await this.saveFileHashes();

    console.error(`[Cache] Milvus cache cleared successfully: ${this.collectionName}`);
  }
}
