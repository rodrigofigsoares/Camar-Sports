import { applyCommand, type Command } from '../domain/scoring';
import type { Match } from '../domain/model';

type Pending = { command?: Command; undo: boolean; done: () => void };
interface Callbacks {
  current: () => Match | null;
  send: (revision: number, command: Command | undefined, undo: boolean) => Promise<Match>;
  recover: () => Promise<Match>;
  render: (match: Match) => void;
  pending: (pending: boolean) => void;
  notice: (message: string) => void;
  now: () => number;
}

/** Serial writes with immediate score and clock previews. Only acknowledged revisions
 * reach the server; failures discard unsaved previews and restore its state. */
export class MatchCommands {
  private queue: Pending[] = [];
  private base: Match | null = null;
  private running = false;
  private recovering = false;
  private disposed = false;
  constructor(private callbacks: Callbacks) {}

  command(command?: Command, undo = false): Promise<void> {
    if (this.disposed || this.recovering) return Promise.resolve();
    if (!this.running) this.base = this.callbacks.current();
    if (!this.base) return Promise.resolve();
    const completion = new Promise<void>(done => this.queue.push({command,undo,done}));
    this.callbacks.pending(true);
    this.callbacks.notice('');
    this.preview();
    if (!this.running) void this.drain();
    return completion;
  }
  private preview() {
    if (!this.base || this.disposed) return;
    let match = this.base;
    const now = this.callbacks.now();
    for (const entry of this.queue) {
      const command = entry.command;
      if (entry.undo || !command || !(command.type === 'score' || command.type === 'setScore' ||
        (command.type === 'clock' && ['adjust','set'].includes(command.action)))) break;
      // Domain validation can reject a point after a set/match has ended.
      // Leave it to the server to report the error and recover the queue.
      try { match = applyCommand(match,command,now); }
      catch { break; }
    }
    this.callbacks.render(match);
  }
  private async drain() {
    this.running = true;
    try {
      while (this.queue.length && !this.disposed) {
        const entry = this.queue[0];
        const saved = await this.callbacks.send(this.base!.revision,entry.command,entry.undo);
        if (this.disposed) return;
        this.base = saved;
        this.queue.shift();
        this.preview();
        entry.done();
      }
    } catch (error) {
      if (this.disposed) return;
      this.recovering = true;
      const cancelled = this.queue.splice(0);
      this.callbacks.notice((error as Error).message);
      try { this.base = await this.callbacks.recover(); }
      catch { this.callbacks.notice((error as Error).message + ' Não foi possível recarregar; confira sua conexão.'); }
      if (!this.disposed && this.base) this.callbacks.render(this.base);
      cancelled.forEach(entry => entry.done());
    } finally {
      this.running = false;
      this.recovering = false;
      if (!this.disposed) this.callbacks.pending(false);
    }
  }
  dispose() {
    this.disposed = true;
    this.queue.splice(0).forEach(entry => entry.done());
  }
}
