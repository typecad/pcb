import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockedTmpdir, mockedJoin, mockedMkdir, mockedReaddir, mockedStat, mockedUnlink, mockedLogger } = vi.hoisted(
  () => ({
    mockedTmpdir: vi.fn(),
    mockedJoin: vi.fn((...args) => args.join('/')),
    mockedMkdir: vi.fn(),
    mockedReaddir: vi.fn(),
    mockedStat: vi.fn(),
    mockedUnlink: vi.fn(),
    mockedLogger: { default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() } },
  }),
);

vi.mock('node:os', () => ({ tmpdir: mockedTmpdir }));
vi.mock('node:path', () => ({ join: mockedJoin }));
vi.mock('node:fs', () => ({
  promises: { mkdir: mockedMkdir, readdir: mockedReaddir, stat: mockedStat, unlink: mockedUnlink },
}));
vi.mock('../../src/utils/logging.js', () => mockedLogger);

import { CacheUtils } from '../../src/kicad-symbols/utils/CacheUtils.js';

beforeEach(() => {
  vi.resetAllMocks();
  mockedTmpdir.mockReturnValue('/tmp');
  mockedMkdir.mockResolvedValue(undefined);
});

describe('CacheUtils', () => {
  describe('getSharedCacheDir', () => {
    it('should create cache dir and return path', async () => {
      const result = await CacheUtils.getSharedCacheDir();
      expect(mockedTmpdir).toHaveBeenCalledTimes(1);
      expect(mockedMkdir).toHaveBeenCalledWith(expect.stringContaining('kicad-symbols-cache'), { recursive: true });
      expect(result).toContain('/tmp');
    });

    it('should throw when mkdir fails', async () => {
      mockedMkdir.mockRejectedValue(new Error('EACCES'));
      await expect(CacheUtils.getSharedCacheDir()).rejects.toThrow('Failed to create cache directory');
    });
  });

  describe('getDefaultCacheFilePath', () => {
    it('should join cache dir with provided filename', async () => {
      const result = await CacheUtils.getDefaultCacheFilePath('test.json');
      expect(result).toContain('test.json');
    });

    it('should use default filename when not provided', async () => {
      const result = await CacheUtils.getDefaultCacheFilePath();
      expect(result).toContain('kicad-symbols-cache.json');
    });
  });

  describe('getTimestampFilePath', () => {
    it('should join cache dir with timestamp filename', async () => {
      const result = await CacheUtils.getTimestampFilePath();
      expect(result).toContain('.kicad-cache-timestamp');
    });
  });

  describe('cleanupOldCacheFiles', () => {
    it('should unlink old files', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      mockedReaddir.mockResolvedValue(['old.json']);
      mockedStat.mockResolvedValue({ mtime: new Date(now - 48 * 60 * 60 * 1000) });
      await CacheUtils.cleanupOldCacheFiles(24);
      expect(mockedUnlink).toHaveBeenCalledTimes(1);
      expect(mockedLogger.default.info).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should not unlink recent files', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      mockedReaddir.mockResolvedValue(['new.json']);
      mockedStat.mockResolvedValue({ mtime: new Date(now - 60 * 60 * 1000) });
      await CacheUtils.cleanupOldCacheFiles(24);
      expect(mockedUnlink).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should warn on individual file errors', async () => {
      mockedReaddir.mockResolvedValue(['broken.json']);
      mockedStat.mockRejectedValue(new Error('stat fail'));
      await CacheUtils.cleanupOldCacheFiles(24);
      expect(mockedLogger.default.warn).toHaveBeenCalled();
    });

    it('should warn on directory read errors', async () => {
      mockedReaddir.mockRejectedValue(new Error('ENOENT'));
      await CacheUtils.cleanupOldCacheFiles(24);
      expect(mockedLogger.default.warn).toHaveBeenCalled();
      expect(mockedUnlink).not.toHaveBeenCalled();
    });
  });
});
