import type { DLQBackend, DLQEntry } from '../types';
import type { JobRetry } from '../JobRetry';

export class MemoryDLQ implements DLQBackend {
  private entries: Map<string, DLQEntry> = new Map();

  async push(entry: DLQEntry): Promise<void> {
    this.entries.set(entry.id, entry);
  }

  async getAll(): Promise<DLQEntry[]> {
    return Array.from(this.entries.values());
  }

  async get(id: string): Promise<DLQEntry | null> {
    return this.entries.get(id) ?? null;
  }

  async retry(id: string, runner: JobRetry): Promise<unknown> {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`DLQ entry not found: ${id}`);
    this.entries.delete(id);
    return runner.run(entry.name, () => runner.replayEntry(entry));
  }

  async remove(id: string): Promise<void> {
    this.entries.delete(id);
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }

  async size(): Promise<number> {
    return this.entries.size;
  }
}
