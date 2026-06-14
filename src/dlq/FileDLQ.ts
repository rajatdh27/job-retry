import fs from 'fs';
import path from 'path';
import type { DLQBackend, DLQEntry } from '../types';
import type { JobRetry } from '../JobRetry';

export class FileDLQ implements DLQBackend {
  private filePath: string;

  constructor(filePath: string = './job-retry-dlq.json') {
    this.filePath = path.resolve(filePath);
  }

  private read(): DLQEntry[] {
    if (!fs.existsSync(this.filePath)) return [];
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as DLQEntry[];
    } catch {
      return [];
    }
  }

  private write(entries: DLQEntry[]): void {
    fs.writeFileSync(this.filePath, JSON.stringify(entries, null, 2), 'utf8');
  }

  async push(entry: DLQEntry): Promise<void> {
    const entries = this.read();
    entries.push(entry);
    this.write(entries);
  }

  async getAll(): Promise<DLQEntry[]> {
    return this.read();
  }

  async get(id: string): Promise<DLQEntry | null> {
    return this.read().find((e) => e.id === id) ?? null;
  }

  async retry(id: string, runner: JobRetry): Promise<unknown> {
    const entries = this.read();
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error(`DLQ entry not found: ${id}`);
    const [entry] = entries.splice(idx, 1);
    this.write(entries);
    return runner.run(entry.name, () => runner.replayEntry(entry));
  }

  async remove(id: string): Promise<void> {
    const entries = this.read().filter((e) => e.id !== id);
    this.write(entries);
  }

  async clear(): Promise<void> {
    this.write([]);
  }

  async size(): Promise<number> {
    return this.read().length;
  }
}
