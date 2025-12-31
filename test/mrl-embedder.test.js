/**
 * Tests for MRL Embedder
 * 
 * Tests the Matryoshka Representation Learning embedder:
 * - Configurable dimensions (64, 128, 256, 512, 768)
 * - Layer normalization and slicing
 * - Semantic similarity at different dimensions
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createMRLEmbedder, createLegacyEmbedder, createEmbedder, VALID_DIMENSIONS } from '../lib/mrl-embedder.js';
import { cosineSimilarity } from '../lib/utils.js';

describe('MRL Embedder', () => {
  let embedder256;
  
  beforeAll(async () => {
    // Load embedder with 256d (default)
    console.log('[Test] Loading MRL embedder (256d)...');
    embedder256 = await createMRLEmbedder('nomic-ai/nomic-embed-text-v1.5', { dimension: 256 });
    console.log('[Test] MRL embedder loaded');
  }, 120000); // 2 min timeout for model download

  describe('Dimension Configuration', () => {
    it('should export valid dimensions', () => {
      expect(VALID_DIMENSIONS).toEqual([64, 128, 256, 512, 768]);
    });

    it('should produce 256d embeddings by default', async () => {
      const output = await embedder256('test text');
      const vector = Array.from(output.data);
      expect(vector.length).toBe(256);
    });

    it('should attach dimension metadata', () => {
      expect(embedder256.dimension).toBe(256);
      expect(embedder256.modelName).toBe('nomic-ai/nomic-embed-text-v1.5');
    });
  });

  describe('Embedding Quality', () => {
    it('should produce normalized vectors', async () => {
      const output = await embedder256('normalized vector test');
      const vector = Array.from(output.data);
      const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
      expect(magnitude).toBeCloseTo(1, 3);
    });

    it('should generate different embeddings for different text', async () => {
      const output1 = await embedder256('apple fruit');
      const output2 = await embedder256('programming code');
      
      const vector1 = Array.from(output1.data);
      const vector2 = Array.from(output2.data);
      
      const areSame = vector1.every((v, i) => Math.abs(v - vector2[i]) < 0.0001);
      expect(areSame).toBe(false);
    });
  });

  describe('Semantic Similarity', () => {
    it('should give high similarity for semantically similar text', async () => {
      const output1 = await embedder256('user authentication login');
      const output2 = await embedder256('user login authentication');
      
      const vector1 = Array.from(output1.data);
      const vector2 = Array.from(output2.data);
      
      const similarity = cosineSimilarity(vector1, vector2);
      expect(similarity).toBeGreaterThan(0.85);
    });
    
    it('should give lower similarity for different topics', async () => {
      const output1 = await embedder256('database query SQL');
      const output2 = await embedder256('pizza delivery food');
      
      const vector1 = Array.from(output1.data);
      const vector2 = Array.from(output2.data);
      
      const similarity = cosineSimilarity(vector1, vector2);
      expect(similarity).toBeLessThan(0.5);
    });
  });
});

describe('createEmbedder Factory', () => {
  it('should create MRL embedder for nomic models', async () => {
    const config = {
      embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
      embeddingDimension: 128,
      device: 'cpu'
    };
    
    const embedder = await createEmbedder(config);
    expect(embedder.modelName).toContain('nomic');
    expect(embedder.dimension).toBe(128);
  }, 120000);

  it('should fall back to legacy for MiniLM', async () => {
    const config = {
      embeddingModel: 'Xenova/all-MiniLM-L6-v2',
      device: 'cpu'
    };
    
    const embedder = await createEmbedder(config);
    expect(embedder.dimension).toBe(384);
  }, 120000);
});
