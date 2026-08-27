import { BadRequestException, Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class PluginStorageService {
  async readText(pluginId: string, name: string) {
    const file = this.file(pluginId, name);
    try { return await fs.readFile(file, 'utf8'); } catch (error: any) { if (error?.code === 'ENOENT') return null; throw error; }
  }

  async writeText(pluginId: string, name: string, value: string) {
    if (typeof value !== 'string' || Buffer.byteLength(value) > this.maximum()) throw new BadRequestException('Plugin storage value exceeds its per-file limit');
    const file = this.file(pluginId, name);
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o750 });
    const temporary = `${file}.${randomUUID()}.partial`;
    try {
      await fs.writeFile(temporary, value, { mode: 0o640, flag: 'wx' });
      await fs.rename(temporary, file);
    } finally { await fs.rm(temporary, { force: true }).catch(() => undefined); }
  }

  async delete(pluginId: string, name: string) { await fs.rm(this.file(pluginId, name), { force: true }); }

  async list(pluginId: string, prefix = '') {
    if (prefix && !this.safe(prefix)) throw new BadRequestException('Plugin storage prefix is invalid');
    const root = this.root(pluginId);
    const output: string[] = [];
    const visit = async (directory: string) => {
      let entries;
      try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch (error: any) { if (error?.code === 'ENOENT') return; throw error; }
      for (const entry of entries) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(absolute);
        else if (entry.isFile()) output.push(path.relative(root, absolute).split(path.sep).join('/'));
      }
    };
    await visit(root);
    return output.filter((name) => name.startsWith(prefix)).sort();
  }

  private file(pluginId: string, name: string) {
    if (!this.safe(name)) throw new BadRequestException('Plugin storage path is invalid');
    const root = this.root(pluginId);
    const file = path.resolve(root, name);
    if (!file.startsWith(`${root}${path.sep}`)) throw new BadRequestException('Plugin storage path escapes its namespace');
    return file;
  }

  private safe(name: string) { return !!name && !name.startsWith('/') && !name.includes('\\') && !name.includes('\0') && !name.split('/').includes('..'); }
  private root(pluginId: string) { return path.resolve(process.env.PLUGIN_DATA_DIR || (process.env.NODE_ENV === 'production' ? '/data/plugin-data' : './plugin-data'), pluginId); }
  private maximum() { return Number(process.env.PLUGIN_STORAGE_MAX_FILE_BYTES || 1024 * 1024); }
}
