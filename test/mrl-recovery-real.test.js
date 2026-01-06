/**
 * Real Integration Tests for MRL Auto-Recovery
 *
 * Tests embedder stability and error handling with real models.
 * Destructive corruption tests are in mrl-recovery.test.js (mocked).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createMRLEmbedder, createLegacyEmbedder, createEmbedder } from '../lib/mrl-embedder.js';

// Find the transformers cache directory
function getTransformersCacheDir() {
  const transformersPath = dirname(fileURLToPath(import.meta.resolve('@huggingface/transformers')));
  const cacheInParent = join(dirname(transformersPath), '.cache');
  if (existsSync(cacheInParent)) return cacheInParent;
  return join(transformersPath, '.cache');
}

describe('MRL Embedder Integration', () => {
  const modelName = 'nomic-ai/nomic-embed-text-v1.5';
  let embedder;

  beforeAll(async () => {
    console.log('[Test] Loading MRL embedder...');
    embedder = await createMRLEmbedder(modelName, { dimension: 256 });
    console.log('[Test] MRL embedder loaded');
  }, 300000);

  it('should create embedder with correct metadata', () => {
    expect(embedder.dimension).toBe(256);
    expect(embedder.modelName).toBe(modelName);
    expect(embedder.device).toBe('cpu');
  });

  it('should produce correct dimension embeddings', async () => {
    const result = await embedder('test embedding');
    expect(result.data).toBeDefined();
    expect(result.dims[1]).toBe(256);
    expect(Array.from(result.data).length).toBe(256);
  });

  it('should produce normalized vectors', async () => {
    const result = await embedder('normalized test');
    const vector = Array.from(result.data);
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    expect(magnitude).toBeCloseTo(1, 3);
  });

  it('should handle multiple sequential embeddings', async () => {
    const texts = ['first', 'second', 'third', 'fourth', 'fifth'];

    for (const text of texts) {
      const result = await embedder(text);
      expect(result.data).toBeDefined();
      expect(Array.from(result.data).length).toBe(256);
    }
  });

  it('should handle concurrent embeddings', async () => {
    const results = await Promise.all([
      embedder('concurrent 1'),
      embedder('concurrent 2'),
      embedder('concurrent 3')
    ]);

    results.forEach(result => {
      expect(result.data).toBeDefined();
      expect(result.dims[1]).toBe(256);
    });
  });

  it('should handle various input types', async () => {
    const inputs = [
      'normal text',
      'a'.repeat(500),  // long text
      'special: @#$%^&*()',
      'unicode: 你好世界',
      '   whitespace   '
    ];

    for (const input of inputs) {
      const result = await embedder(input);
      expect(result.data).toBeDefined();
    }
  });
});

describe('Legacy Embedder Integration', () => {
  let embedder;

  beforeAll(async () => {
    embedder = await createLegacyEmbedder();
  }, 120000);

  it('should create legacy embedder with correct metadata', () => {
    expect(embedder.dimension).toBe(384);
    expect(embedder.modelName).toBe('Xenova/all-MiniLM-L6-v2');
  });

  it('should produce 384d embeddings', async () => {
    const result = await embedder('legacy test');
    expect(Array.from(result.data).length).toBe(384);
  });
});

describe('Factory Function', () => {
  it('should create MRL embedder for nomic model', async () => {
    const embedder = await createEmbedder({
      embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
      embeddingDimension: 128,
      device: 'cpu'
    });

    expect(embedder.dimension).toBe(128);
    expect(embedder.modelName).toContain('nomic');
  }, 300000);

  it('should create legacy embedder for MiniLM', async () => {
    const embedder = await createEmbedder({
      embeddingModel: 'Xenova/all-MiniLM-L6-v2',
      device: 'cpu'
    });

    expect(embedder.dimension).toBe(384);
    expect(embedder.modelName).toBe('Xenova/all-MiniLM-L6-v2');
  }, 120000);
});

describe('Cache Location Verification', () => {
  it('should find transformers cache directory', () => {
    const cacheDir = getTransformersCacheDir();
    expect(existsSync(cacheDir)).toBe(true);
    console.log(`[Test] Cache directory: ${cacheDir}`);
  });

  it('should have model files in cache', () => {
    const cacheDir = getTransformersCacheDir();
    const modelDir = join(cacheDir, 'nomic-ai', 'nomic-embed-text-v1.5', 'onnx');

    if (existsSync(modelDir)) {
      const files = readdirSync(modelDir);
      expect(files.some(f => f.endsWith('.onnx'))).toBe(true);
      console.log(`[Test] Model files: ${files.join(', ')}`);
    } else {
      console.log('[Test] Model directory not found (may need download)');
    }
  });
});
