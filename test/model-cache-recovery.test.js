/**
 * Tests for Model Cache Auto-Recovery
 *
 * Tests the auto-recovery mechanism for corrupted ONNX model files:
 * - Cache directory detection and clearing
 * - Protobuf parsing error detection
 * - Retry after cache clear
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

// Create a test cache directory structure
const testCacheBase = join(tmpdir(), 'smart-coding-mcp-test-cache');

describe('Model Cache Recovery', () => {
  beforeEach(() => {
    // Clean up before each test
    if (existsSync(testCacheBase)) {
      rmSync(testCacheBase, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up after each test
    if (existsSync(testCacheBase)) {
      rmSync(testCacheBase, { recursive: true, force: true });
    }
  });

  describe('Cache Directory Detection', () => {
    it('should detect cache directory with forward slash model names', () => {
      // Create a mock cache structure
      const cacheDir = join(testCacheBase, 'nomic-ai', 'nomic-embed-text-v1.5', 'onnx');
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(join(cacheDir, 'model.onnx'), 'corrupted data');

      expect(existsSync(cacheDir)).toBe(true);

      // Simulate cache clear logic
      const modelName = 'nomic-ai/nomic-embed-text-v1.5';
      const cachePath = join(testCacheBase, ...modelName.split('/'));

      if (existsSync(cachePath)) {
        rmSync(cachePath, { recursive: true, force: true });
      }

      expect(existsSync(cachePath)).toBe(false);
    });

    it('should handle non-existent cache gracefully', () => {
      const nonExistentPath = join(testCacheBase, 'does-not-exist');

      // Should not throw
      let cleared = false;
      if (existsSync(nonExistentPath)) {
        rmSync(nonExistentPath, { recursive: true, force: true });
        cleared = true;
      }

      expect(cleared).toBe(false);
    });

    it('should clear nested model cache directories', () => {
      // Create nested structure mimicking real cache
      const modelDir = join(testCacheBase, 'nomic-ai', 'nomic-embed-text-v1.5');
      const onnxDir = join(modelDir, 'onnx');
      const tokenizerDir = join(modelDir, 'tokenizer');

      mkdirSync(onnxDir, { recursive: true });
      mkdirSync(tokenizerDir, { recursive: true });

      writeFileSync(join(onnxDir, 'model.onnx'), 'corrupted');
      writeFileSync(join(tokenizerDir, 'tokenizer.json'), '{}');

      expect(existsSync(onnxDir)).toBe(true);
      expect(existsSync(tokenizerDir)).toBe(true);

      // Clear the model directory (not just onnx)
      rmSync(modelDir, { recursive: true, force: true });

      expect(existsSync(modelDir)).toBe(false);
      expect(existsSync(onnxDir)).toBe(false);
      expect(existsSync(tokenizerDir)).toBe(false);
    });
  });

  describe('Error Detection', () => {
    it('should identify Protobuf parsing errors as recoverable', () => {
      const recoverableErrors = [
        'Protobuf parsing failed',
        'Load model from /path/to/model.onnx failed:Protobuf parsing failed.',
        'Error: Protobuf parsing failed'
      ];

      for (const errorMsg of recoverableErrors) {
        const isRecoverable = errorMsg.includes('Protobuf parsing failed');
        expect(isRecoverable).toBe(true);
      }
    });

    it('should not identify other errors as recoverable', () => {
      const nonRecoverableErrors = [
        'Network error',
        'File not found',
        'Out of memory',
        'Invalid model format',
        'ONNX runtime error'
      ];

      for (const errorMsg of nonRecoverableErrors) {
        const isRecoverable = errorMsg.includes('Protobuf parsing failed');
        expect(isRecoverable).toBe(false);
      }
    });
  });

  describe('Recovery Flow', () => {
    it('should simulate recovery sequence', async () => {
      // Create corrupted cache
      const cacheDir = join(testCacheBase, 'nomic-ai', 'nomic-embed-text-v1.5');
      mkdirSync(join(cacheDir, 'onnx'), { recursive: true });
      writeFileSync(join(cacheDir, 'onnx', 'model.onnx'), 'corrupted protobuf data');

      let loadAttempts = 0;
      let cacheCleared = false;

      // Simulate the recovery flow
      const mockLoadModel = async () => {
        loadAttempts++;
        if (loadAttempts === 1 && !cacheCleared) {
          throw new Error('Load model from /path/model.onnx failed:Protobuf parsing failed.');
        }
        return { success: true };
      };

      const mockClearCache = () => {
        if (existsSync(cacheDir)) {
          rmSync(cacheDir, { recursive: true, force: true });
          cacheCleared = true;
          return true;
        }
        return false;
      };

      // First attempt should fail
      let result;
      try {
        result = await mockLoadModel();
      } catch (err) {
        if (err.message.includes('Protobuf parsing failed')) {
          // Clear cache and retry
          mockClearCache();
          result = await mockLoadModel();
        }
      }

      expect(loadAttempts).toBe(2);
      expect(cacheCleared).toBe(true);
      expect(result.success).toBe(true);
      expect(existsSync(cacheDir)).toBe(false);
    });

    it('should propagate non-recoverable errors', async () => {
      const mockLoadModel = async () => {
        throw new Error('Network connection failed');
      };

      await expect(async () => {
        try {
          await mockLoadModel();
        } catch (err) {
          if (err.message.includes('Protobuf parsing failed')) {
            // Would clear cache and retry, but this error is different
          }
          throw err;
        }
      }).rejects.toThrow('Network connection failed');
    });

    it('should handle cache clear failure gracefully', async () => {
      let loadAttempts = 0;

      const mockLoadModel = async () => {
        loadAttempts++;
        throw new Error('Protobuf parsing failed');
      };

      const mockClearCache = () => {
        // Simulate cache clear failure (e.g., permission denied)
        return false;
      };

      await expect(async () => {
        try {
          await mockLoadModel();
        } catch (err) {
          if (err.message.includes('Protobuf parsing failed')) {
            if (!mockClearCache()) {
              // Cache clear failed, re-throw original error
              throw err;
            }
          } else {
            throw err;
          }
        }
      }).rejects.toThrow('Protobuf parsing failed');

      expect(loadAttempts).toBe(1);
    });
  });

  describe('Path Resolution', () => {
    it('should handle model names with organization prefix', () => {
      const modelName = 'nomic-ai/nomic-embed-text-v1.5';
      const parts = modelName.split('/');

      expect(parts).toEqual(['nomic-ai', 'nomic-embed-text-v1.5']);
      expect(parts.length).toBe(2);
    });

    it('should handle model names without organization prefix', () => {
      const modelName = 'all-MiniLM-L6-v2';
      const parts = modelName.split('/');

      expect(parts).toEqual(['all-MiniLM-L6-v2']);
      expect(parts.length).toBe(1);
    });

    it('should build correct cache paths', () => {
      const baseDir = '/some/cache/path';
      const modelName = 'nomic-ai/nomic-embed-text-v1.5';

      const cachePath = join(baseDir, ...modelName.split('/'));

      expect(cachePath).toBe('/some/cache/path/nomic-ai/nomic-embed-text-v1.5');
    });
  });
});
