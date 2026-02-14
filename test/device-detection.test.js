/**
 * Tests for Device Detection
 * 
 * Tests device detection and configuration:
 * - CPU fallback detection
 * - SMART_CODING_DEVICE env var handling
 * - Config device option
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { loadConfig, DEFAULT_CONFIG } from '../lib/config.js';

describe('Device Detection', () => {
  const originalEnv = process.env;

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe('Default Configuration', () => {
    it('should default to auto device', () => {
      expect(DEFAULT_CONFIG.device).toBe('auto');
    });

    it('should have valid device options', () => {
      const validDevices = ['cpu', 'webgpu', 'auto'];
      expect(validDevices).toContain(DEFAULT_CONFIG.device);
    });
  });

  describe('Environment Variable Override', () => {
    it('should accept cpu device from env', async () => {
      process.env.SMART_CODING_DEVICE = 'cpu';
      const config = await loadConfig();
      expect(config.device).toBe('cpu');
    });

    it('should accept webgpu device from env', async () => {
      process.env.SMART_CODING_DEVICE = 'webgpu';
      const config = await loadConfig();
      expect(config.device).toBe('webgpu');
    });

    it('should accept auto device from env', async () => {
      process.env.SMART_CODING_DEVICE = 'auto';
      const config = await loadConfig();
      expect(config.device).toBe('auto');
    });

    it('should reject invalid device values', async () => {
      process.env.SMART_CODING_DEVICE = 'invalid';
      const config = await loadConfig();
      // Should fall back to default
      expect(config.device).toBe(DEFAULT_CONFIG.device);
    });

    it('should be case-insensitive', async () => {
      process.env.SMART_CODING_DEVICE = 'CPU';
      const config = await loadConfig();
      expect(config.device).toBe('cpu');
    });
  });

  describe('Embedding Dimension Config', () => {
    it('should default to 128 dimensions', () => {
      expect(DEFAULT_CONFIG.embeddingDimension).toBe(128);
    });

    it('should accept valid dimensions from env', async () => {
      process.env.SMART_CODING_EMBEDDING_DIMENSION = '512';
      const config = await loadConfig();
      expect(config.embeddingDimension).toBe(512);
    });

    it('should accept all valid dimensions', async () => {
      for (const dim of [64, 128, 256, 512, 768]) {
        process.env.SMART_CODING_EMBEDDING_DIMENSION = String(dim);
        const config = await loadConfig();
        expect(config.embeddingDimension).toBe(dim);
      }
    });

    it('should reject invalid dimensions', async () => {
      process.env.SMART_CODING_EMBEDDING_DIMENSION = '100';
      const config = await loadConfig();
      expect(config.embeddingDimension).toBe(DEFAULT_CONFIG.embeddingDimension);
    });
  });

  describe('Chunking Mode Config', () => {
    it('should default to smart chunking', () => {
      expect(DEFAULT_CONFIG.chunkingMode).toBe('smart');
    });

    it('should accept valid modes from env', async () => {
      for (const mode of ['smart', 'ast', 'line']) {
        process.env.SMART_CODING_CHUNKING_MODE = mode;
        const config = await loadConfig();
        expect(config.chunkingMode).toBe(mode);
      }
    });

    it('should reject invalid modes', async () => {
      process.env.SMART_CODING_CHUNKING_MODE = 'invalid';
      const config = await loadConfig();
      expect(config.chunkingMode).toBe(DEFAULT_CONFIG.chunkingMode);
    });
  });

  describe('Embedding Provider Config', () => {
    it('should default to local provider', () => {
      expect(DEFAULT_CONFIG.embeddingProvider).toBe('local');
    });

    it('should accept gemini provider from env', async () => {
      process.env.SMART_CODING_EMBEDDING_PROVIDER = 'gemini';
      const config = await loadConfig();
      expect(config.embeddingProvider).toBe('gemini');
    });

    it('should reject invalid provider values', async () => {
      process.env.SMART_CODING_EMBEDDING_PROVIDER = 'invalid';
      const config = await loadConfig();
      expect(config.embeddingProvider).toBe(DEFAULT_CONFIG.embeddingProvider);
    });
  });

  describe('Gemini Config', () => {
    it('should load Gemini API key from env', async () => {
      process.env.SMART_CODING_GEMINI_API_KEY = 'test-key';
      const config = await loadConfig();
      expect(config.geminiApiKey).toBe('test-key');
    });

    it('should load Gemini model from env', async () => {
      process.env.SMART_CODING_GEMINI_MODEL = 'text-embedding-004';
      const config = await loadConfig();
      expect(config.geminiModel).toBe('text-embedding-004');
    });

    it('should load Gemini base URL from env', async () => {
      process.env.SMART_CODING_GEMINI_BASE_URL = 'https://example.test/openai';
      const config = await loadConfig();
      expect(config.geminiBaseURL).toBe('https://example.test/openai');
    });

    it('should parse Gemini dimensions from env', async () => {
      process.env.SMART_CODING_GEMINI_DIMENSIONS = '1024';
      const config = await loadConfig();
      expect(config.geminiDimensions).toBe(1024);
    });

    it('should parse Gemini batching and retry settings from env', async () => {
      process.env.SMART_CODING_GEMINI_BATCH_SIZE = '16';
      process.env.SMART_CODING_GEMINI_BATCH_FLUSH_MS = '25';
      process.env.SMART_CODING_GEMINI_MAX_RETRIES = '4';
      const config = await loadConfig();
      expect(config.geminiBatchSize).toBe(16);
      expect(config.geminiBatchFlushMs).toBe(25);
      expect(config.geminiMaxRetries).toBe(4);
    });
  });
});
