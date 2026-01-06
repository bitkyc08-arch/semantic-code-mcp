/**
 * Tests for MRL Embedder Auto-Recovery
 *
 * Uses mocked pipeline to test corruption detection and recovery:
 * - Startup corruption → clear cache → reload
 * - Runtime corruption → reload → retry
 * - Runtime corruption → reload fails → fallback to legacy
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the transformers pipeline
const mockPipeline = vi.fn();
const mockLayerNorm = vi.fn();

vi.mock('@huggingface/transformers', () => ({
  pipeline: (...args) => mockPipeline(...args),
  layer_norm: (...args) => mockLayerNorm(...args)
}));

// Mock fs for cache clearing
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  rmSync: vi.fn()
}));

describe('MRL Auto-Recovery (Mocked)', () => {
  let callCount = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    callCount = 0;

    // Default mock implementation for layer_norm
    mockLayerNorm.mockImplementation((tensor) => ({
      slice: () => ({
        normalize: () => ({
          data: new Float32Array(256).fill(0.1),
          dims: [1, 256]
        })
      }),
      dims: tensor.dims
    }));
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('Startup Recovery', () => {
    it('should recover from corruption on first load', async () => {
      // First call throws corruption, second succeeds
      mockPipeline
        .mockRejectedValueOnce(new Error('Protobuf parsing failed'))
        .mockResolvedValueOnce(async () => ({
          data: new Float32Array(768).fill(0.1),
          dims: [1, 768]
        }));

      const { createMRLEmbedder } = await import('../lib/mrl-embedder.js');
      const embedder = await createMRLEmbedder('test-model', { dimension: 256 });

      expect(mockPipeline).toHaveBeenCalledTimes(2);
      expect(embedder).toBeDefined();
    });

    it('should throw if recovery also fails with non-corruption error', async () => {
      mockPipeline.mockRejectedValue(new Error('Network error'));

      const { createMRLEmbedder } = await import('../lib/mrl-embedder.js');

      await expect(createMRLEmbedder('test-model', { dimension: 256 }))
        .rejects.toThrow('Network error');
    });
  });

  describe('Runtime Recovery', () => {
    it('should reload model on runtime corruption and retry', async () => {
      let embedCallCount = 0;
      const mockExtractor = vi.fn().mockImplementation(async () => {
        embedCallCount++;
        if (embedCallCount === 1) {
          throw new Error('Protobuf parsing failed');
        }
        return {
          data: new Float32Array(768).fill(0.1),
          dims: [1, 768]
        };
      });

      mockPipeline.mockResolvedValue(mockExtractor);

      const { createMRLEmbedder } = await import('../lib/mrl-embedder.js');
      const embedder = await createMRLEmbedder('test-model', { dimension: 256 });

      // First embed triggers corruption, then reload and retry
      const result = await embedder('test text');

      expect(result.data).toBeDefined();
      // Pipeline called: 1 (init) + 1 (reload after corruption) = 2
      expect(mockPipeline).toHaveBeenCalledTimes(2);
    });

    it('should detect various corruption error messages', async () => {
      const corruptionErrors = [
        'Protobuf parsing failed',
        'Invalid model format',
        'ONNX model is corrupt'
      ];

      for (const errorMsg of corruptionErrors) {
        vi.resetModules();
        vi.clearAllMocks();

        let throwError = true;
        const mockExtractor = vi.fn().mockImplementation(async () => {
          if (throwError) {
            throwError = false;
            throw new Error(errorMsg);
          }
          return {
            data: new Float32Array(768).fill(0.1),
            dims: [1, 768]
          };
        });

        mockPipeline.mockResolvedValue(mockExtractor);
        mockLayerNorm.mockImplementation((tensor) => ({
          slice: () => ({
            normalize: () => ({
              data: new Float32Array(256).fill(0.1),
              dims: [1, 256]
            })
          }),
          dims: tensor.dims
        }));

        const { createMRLEmbedder } = await import('../lib/mrl-embedder.js');
        const embedder = await createMRLEmbedder('test-model', { dimension: 256 });

        const result = await embedder('test');
        expect(result.data).toBeDefined();
      }
    });
  });

  describe('Fallback to Legacy', () => {
    it('should fall back to legacy when reload also fails', async () => {
      let pipelineCallCount = 0;
      let embedCallCount = 0;

      // Mock extractor that fails on first embed call
      const corruptExtractor = vi.fn().mockImplementation(async () => {
        embedCallCount++;
        if (embedCallCount === 1) {
          throw new Error('Protobuf parsing failed');
        }
        return {
          data: new Float32Array(768).fill(0.1),
          dims: [1, 768]
        };
      });

      // Mock legacy extractor that works
      const legacyExtractor = vi.fn().mockResolvedValue({
        data: new Float32Array(384).fill(0.2),
        dims: [1, 384]
      });

      mockPipeline.mockImplementation(async (task, model) => {
        pipelineCallCount++;
        if (pipelineCallCount <= 2) {
          if (pipelineCallCount === 2) {
            // Reload attempt fails
            throw new Error('Network timeout');
          }
          return corruptExtractor;
        }
        // Third call is legacy model
        return legacyExtractor;
      });

      const { createMRLEmbedder } = await import('../lib/mrl-embedder.js');
      const embedder = await createMRLEmbedder('nomic-ai/nomic-embed-text-v1.5', { dimension: 256 });

      // This should trigger: corruption → reload fail → fallback to legacy
      const result = await embedder('test text');

      expect(result.data).toBeDefined();
      // Dimension should update to legacy (384)
      expect(embedder.dimension).toBe(384);
    });

    it('should use fallback for subsequent calls after switching', async () => {
      let pipelineCallCount = 0;
      let embedCallCount = 0;

      const corruptExtractor = vi.fn().mockImplementation(async () => {
        embedCallCount++;
        throw new Error('Protobuf parsing failed');
      });

      const legacyExtractor = vi.fn().mockResolvedValue({
        data: new Float32Array(384).fill(0.2),
        dims: [1, 384]
      });

      mockPipeline.mockImplementation(async (task, model) => {
        pipelineCallCount++;
        if (model.includes('nomic')) {
          if (pipelineCallCount >= 2) {
            throw new Error('Model unavailable');
          }
          return corruptExtractor;
        }
        return legacyExtractor;
      });

      const { createMRLEmbedder } = await import('../lib/mrl-embedder.js');
      const embedder = await createMRLEmbedder('nomic-ai/nomic-embed-text-v1.5', { dimension: 256 });

      // First call triggers fallback
      await embedder('first');

      // Subsequent calls should use legacy directly
      const legacyCallsBefore = legacyExtractor.mock.calls.length;
      await embedder('second');
      await embedder('third');

      expect(legacyExtractor.mock.calls.length).toBe(legacyCallsBefore + 2);
    });
  });

  describe('Non-Corruption Errors', () => {
    it('should throw non-corruption errors without recovery attempt', async () => {
      const mockExtractor = vi.fn().mockRejectedValue(new Error('Out of memory'));
      mockPipeline.mockResolvedValue(mockExtractor);

      const { createMRLEmbedder } = await import('../lib/mrl-embedder.js');
      const embedder = await createMRLEmbedder('test-model', { dimension: 256 });

      await expect(embedder('test')).rejects.toThrow('Out of memory');

      // Should not have attempted reload (only initial load)
      expect(mockPipeline).toHaveBeenCalledTimes(1);
    });
  });
});
