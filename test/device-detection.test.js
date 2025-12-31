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
    it('should default to cpu device', () => {
      expect(DEFAULT_CONFIG.device).toBe('cpu');
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
    it('should default to 256 dimensions', () => {
      expect(DEFAULT_CONFIG.embeddingDimension).toBe(256);
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
});
