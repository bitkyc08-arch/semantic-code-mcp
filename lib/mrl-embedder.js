/**
 * MRL (Matryoshka Representation Learning) Embedder
 *
 * Provides flexible embedding dimensions (64, 128, 256, 512, 768) using
 * nomic-embed-text-v1.5 with layer normalization and dimension slicing.
 */

import { pipeline, layer_norm } from '@huggingface/transformers';
import { existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Valid MRL dimensions for nomic-embed-text-v1.5
const VALID_DIMENSIONS = [64, 128, 256, 512, 768];

/**
 * Clear the HuggingFace transformers cache for a specific model
 * Used for auto-recovery from corrupted model files
 */
function clearModelCache(modelName) {
  try {
    // Find the transformers package location
    // import.meta.resolve may return .../dist/index.js, so check parent too
    const resolvedPath = dirname(fileURLToPath(import.meta.resolve('@huggingface/transformers')));
    const possibleRoots = [resolvedPath, dirname(resolvedPath)];

    for (const root of possibleRoots) {
      // Try different cache path patterns
      const cachePaths = [
        join(root, '.cache', modelName.replace('/', '-')),      // nomic-ai-nomic-embed-text-v1.5
        join(root, '.cache', ...modelName.split('/'))           // nomic-ai/nomic-embed-text-v1.5
      ];

      for (const cacheDir of cachePaths) {
        if (existsSync(cacheDir)) {
          console.error(`[MRL] Clearing corrupted cache: ${cacheDir}`);
          rmSync(cacheDir, { recursive: true, force: true });
          return true;
        }
      }
    }
  } catch (e) {
    console.error(`[MRL] Failed to clear cache: ${e.message}`);
  }
  return false;
}

/**
 * Create an MRL-enabled embedder with configurable output dimensions
 * 
 * @param {string} modelName - Model identifier (e.g., 'nomic-ai/nomic-embed-text-v1.5')
 * @param {object} options - Configuration options
 * @param {number} options.dimension - Target embedding dimension (64, 128, 256, 512, 768)
 * @param {string} options.device - Device to use ('cpu', 'webgpu', 'auto')
 * @returns {Function} Embedder function compatible with existing codebase
 */
export async function createMRLEmbedder(modelName, options = {}) {
  const dimension = options.dimension || 256;
  const device = options.device || 'cpu';
  
  // Validate dimension
  if (!VALID_DIMENSIONS.includes(dimension)) {
    console.error(`[MRL] Invalid dimension ${dimension}, using 256. Valid: ${VALID_DIMENSIONS.join(', ')}`);
  }
  
  const targetDim = VALID_DIMENSIONS.includes(dimension) ? dimension : 256;
  
  console.error(`[MRL] Loading ${modelName} (output: ${targetDim}d, device: ${device})`);
  
  // Detect best device if auto
  const finalDevice = device === 'auto' ? detectBestDevice() : device;
  
  // Create the feature extraction pipeline with auto-recovery for corrupted models
  const pipelineOptions = {};
  if (finalDevice === 'webgpu') {
    pipelineOptions.device = 'webgpu';
  }

  let extractor;

  // Helper to detect corruption errors
  function isCorruptionError(err) {
    if (!err.message) return false;
    return err.message.includes('Protobuf parsing failed') ||
           err.message.includes('Invalid model') ||
           err.message.includes('ONNX') && err.message.includes('corrupt');
  }

  // Helper to load/reload the extractor
  async function loadExtractor(clearCache = false) {
    if (clearCache) {
      console.error(`[MRL] Corrupted model detected, attempting auto-recovery...`);
      clearModelCache(modelName);
    }
    return await pipeline('feature-extraction', modelName, pipelineOptions);
  }

  try {
    extractor = await loadExtractor();
  } catch (err) {
    if (isCorruptionError(err)) {
      extractor = await loadExtractor(true);
    } else {
      throw err;
    }
  }

  console.error(`[MRL] Model loaded on ${finalDevice}`);

  // Fallback embedder for when MRL model fails at runtime
  let fallbackEmbedder = null;

  /**
   * Embed text with MRL dimension slicing
   * Compatible with existing embedder(text, options) signature
   * Includes runtime auto-recovery for corrupted models with fallback
   */
  async function embed(text, embedOptions = {}) {
    // If we've fallen back to legacy, use it
    if (fallbackEmbedder) {
      return await fallbackEmbedder(text, embedOptions);
    }

    async function doEmbed() {
      // Generate full 768d embedding
      let embeddings = await extractor(text, { pooling: 'mean' });

      // Apply MRL: layer_norm -> slice -> normalize
      embeddings = layer_norm(embeddings, [embeddings.dims[1]])
        .slice(null, [0, targetDim])
        .normalize(2, -1);

      // Return in format compatible with existing code (has .data property)
      return {
        data: embeddings.data,
        dims: [embeddings.dims[0], targetDim]
      };
    }

    try {
      return await doEmbed();
    } catch (err) {
      // Runtime corruption detection - try reload first
      if (isCorruptionError(err)) {
        console.error(`[MRL] Runtime corruption detected, attempting reload...`);
        try {
          extractor = await loadExtractor(true);
          return await doEmbed();
        } catch (reloadErr) {
          // Reload failed - fall back to legacy model
          console.error(`[MRL] Reload failed, falling back to legacy model...`);
          const { createLegacyEmbedder } = await import('./mrl-embedder.js');
          fallbackEmbedder = await createLegacyEmbedder();
          embed.dimension = fallbackEmbedder.dimension;
          embed.modelName = fallbackEmbedder.modelName;
          return await fallbackEmbedder(text, embedOptions);
        }
      }
      throw err;
    }
  }
  
  // Attach metadata
  embed.modelName = modelName;
  embed.dimension = targetDim;
  embed.device = finalDevice;
  
  return embed;
}

/**
 * Detect best available device for inference
 */
function detectBestDevice() {
  // WebGPU check (browser environment)
  if (typeof navigator !== 'undefined' && navigator.gpu) {
    return 'webgpu';
  }
  
  // Node.js with experimental WebGPU (Node 20+)
  // This would require --experimental-webgpu flag
  // For now, default to CPU in Node.js
  return 'cpu';
}

/**
 * Create a legacy-compatible embedder (384d, MiniLM)
 * Used as fallback if MRL model fails to load
 */
export async function createLegacyEmbedder(modelName = 'Xenova/all-MiniLM-L6-v2') {
  console.error(`[Embedder] Loading legacy model: ${modelName}`);
  const extractor = await pipeline('feature-extraction', modelName);
  
  async function embed(text, options = {}) {
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return output;
  }
  
  embed.modelName = modelName;
  embed.dimension = 384;
  embed.device = 'cpu';
  
  return embed;
}

/**
 * Smart embedder factory - picks MRL or legacy based on config
 */
export async function createEmbedder(config) {
  const model = config.embeddingModel || 'nomic-ai/nomic-embed-text-v1.5';
  const dimension = config.embeddingDimension || 256;
  const device = config.device || 'cpu';
  
  // Use MRL for nomic models
  if (model.includes('nomic')) {
    try {
      return await createMRLEmbedder(model, { dimension, device });
    } catch (err) {
      console.error(`[Embedder] MRL model failed: ${err.message}, falling back to legacy`);
      return await createLegacyEmbedder();
    }
  }
  
  // Use legacy for MiniLM and other models
  return await createLegacyEmbedder(model);
}

export { VALID_DIMENSIONS };
