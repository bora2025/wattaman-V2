import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { PluginStorageService } from './plugin-storage.service';

describe('PluginStorageService', () => {
  const original = process.env;
  let directory: string;
  beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wattanam-plugin-data-')); process.env = { ...original, PLUGIN_DATA_DIR: directory }; });
  afterEach(async () => { process.env = original; await fs.rm(directory, { recursive: true, force: true }); });

  it('reads, lists, and deletes files only inside a plugin namespace', async () => {
    const service = new PluginStorageService();
    await service.writeText('wattanam.test', 'jobs/state.txt', 'ready');
    await expect(service.readText('wattanam.test', 'jobs/state.txt')).resolves.toBe('ready');
    await expect(service.readText('wattanam.other', 'jobs/state.txt')).resolves.toBeNull();
    await expect(service.list('wattanam.test')).resolves.toEqual(['jobs/state.txt']);
    await service.delete('wattanam.test', 'jobs/state.txt');
    await expect(service.readText('wattanam.test', 'jobs/state.txt')).resolves.toBeNull();
  });

  it('rejects traversal and oversized content', async () => {
    const service = new PluginStorageService();
    await expect(service.writeText('wattanam.test', '../escape', 'bad')).rejects.toThrow('invalid');
    process.env.PLUGIN_STORAGE_MAX_FILE_BYTES = '3';
    await expect(service.writeText('wattanam.test', 'large.txt', 'four')).rejects.toThrow('limit');
  });
});
