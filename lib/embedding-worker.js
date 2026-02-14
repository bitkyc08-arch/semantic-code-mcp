import { parentPort, workerData } from "worker_threads";
import { pipeline, layer_norm } from "@huggingface/transformers";
import { existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createGeminiEmbedder } from './gemini-embedder.js';

let embedder = null;
const VALID_DIMENSIONS = [64, 128, 256, 512, 768];

/**
 * Clear the HuggingFace transformers cache for a specific model
 * Used for auto-recovery from corrupted model files
 */
function clearModelCache(modelName) {
  try {
    const transformersPath = dirname(fileURLToPath(import.meta.resolve('@huggingface/transformers')));
    const cacheDir = join(transformersPath, '.cache', ...modelName.split('/'));
    if (existsSync(cacheDir)) {
      console.error(`[Worker] Clearing corrupted cache: ${cacheDir}`);
      rmSync(cacheDir, { recursive: true, force: true });
      return true;
    }
  } catch (e) {
    console.error(`[Worker] Failed to clear cache: ${e.message}`);
  }
  return false;
}

// Initialize the embedding model once when worker starts
async function initializeEmbedder() {
  if (!embedder) {
    const provider = (workerData.embeddingProvider || 'local').toLowerCase();
    if (['gemini', 'openai', 'openai-compatible', 'vertex'].includes(provider)) {
      embedder = await createGeminiEmbedder({
        embeddingProvider: provider,
        embeddingModel: workerData.embeddingModel,
        embeddingDimension: workerData.embeddingDimension,
        geminiApiKey: workerData.geminiApiKey,
        geminiModel: workerData.geminiModel,
        geminiBaseURL: workerData.geminiBaseURL,
        embeddingApiKey: workerData.embeddingApiKey,
        embeddingBaseURL: workerData.embeddingBaseURL,
        openaiApiKey: workerData.openaiApiKey,
        vertexProject: workerData.vertexProject,
        vertexLocation: workerData.vertexLocation,
        googleApplicationCredentials: workerData.googleApplicationCredentials,
        geminiDimensions: workerData.geminiDimensions,
        geminiBatchSize: workerData.geminiBatchSize,
        geminiBatchFlushMs: workerData.geminiBatchFlushMs,
        geminiMaxRetries: workerData.geminiMaxRetries,
        verbose: workerData.verbose
      });
      return embedder;
    }

    const modelName = workerData.embeddingModel || 'nomic-ai/nomic-embed-text-v1.5';
    const dimension = workerData.embeddingDimension || 256;
    const targetDim = VALID_DIMENSIONS.includes(dimension) ? dimension : 256;
    const isNomic = modelName.includes('nomic');

    // Load model with auto-recovery for corrupted files
    let extractor;
    try {
      extractor = await pipeline("feature-extraction", modelName);
    } catch (err) {
      if (err.message && err.message.includes('Protobuf parsing failed')) {
        console.error(`[Worker] Corrupted model detected, attempting auto-recovery...`);
        if (clearModelCache(modelName)) {
          extractor = await pipeline("feature-extraction", modelName);
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }
    
    if (isNomic) {
      // MRL embedder with dimension slicing
      embedder = async function(text) {
        let embeddings = await extractor(text, { pooling: 'mean' });
        embeddings = layer_norm(embeddings, [embeddings.dims[1]])
          .slice(null, [0, targetDim])
          .normalize(2, -1);
        return { data: embeddings.data };
      };
      embedder.dimension = targetDim;
    } else {
      // Legacy embedder (MiniLM etc.)
      embedder = async function(text) {
        return await extractor(text, { pooling: 'mean', normalize: true });
      };
      embedder.dimension = 384;
    }
    
    embedder.modelName = modelName;
  }
  return embedder;
}

/**
 * Process chunks with optimized single-text embedding
 * Note: Batch processing with transformers.js WASM backend doesn't improve speed
 * because it loops internally. Single calls are actually faster.
 */
async function processChunks(chunks) {
  const embedder = await initializeEmbedder();
  const results = [];

  for (const chunk of chunks) {
    try {
      const output = await embedder(chunk.text, { pooling: "mean", normalize: true });
      results.push({
        file: chunk.file,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        content: chunk.text,
        vector: Array.from(output.data),
        success: true
      });
    } catch (error) {
      results.push({
        file: chunk.file,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        error: error.message,
        success: false
      });
    }
  }

  return results;
}

// Listen for messages from main thread
parentPort.on("message", async (message) => {
  if (message.type === "process") {
    try {
      const results = await processChunks(message.chunks);
      parentPort.postMessage({ type: "results", results, batchId: message.batchId });
    } catch (error) {
      parentPort.postMessage({ type: "error", error: error.message, batchId: message.batchId });
    }
  } else if (message.type === "shutdown") {
    process.exit(0);
  }
});

// Signal that worker is ready
initializeEmbedder().then(() => {
  parentPort.postMessage({ type: "ready" });
}).catch((error) => {
  parentPort.postMessage({ type: "error", error: error.message });
});
