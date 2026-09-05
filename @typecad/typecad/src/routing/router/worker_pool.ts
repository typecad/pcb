import { Worker } from 'worker_threads';
import logger from '../../utils/logging.js';

export interface WorkerTask {
  id: number;
  payload: Record<string, unknown>;
}

export interface WorkerResult<TResult = unknown> {
  id: number;
  result: TResult;
  error?: unknown;
}

export class WorkerPool {
  private workers: Array<Worker | null> = [];
  private taskQueue: WorkerTask[] = [];
  private idleWorkers: number[] = [];
  private pending: Map<number, (res: WorkerResult) => void> = new Map();
  private nextTaskId = 1;

  constructor(poolSize: number, workerScriptPath: string) {
    for (let i = 0; i < poolSize; i++) {
      const w = new Worker(workerScriptPath);
      const idx = this.workers.length;
      this.workers.push(w);
      this.idleWorkers.push(idx);
      w.on('message', (m: WorkerResult) => this.handleWorkerMessage(idx, m));
      w.on('error', (err) => this.handleWorkerError(idx, err));
      w.on('exit', (code) => {
        this.workers[idx] = null;
        for (const [id, cb] of this.pending.entries()) {
          cb({ id, result: undefined, error: new Error(`Worker ${idx} exited with code ${code}`) });
        }
        this.pending.clear();
      });
    }
  }

  private handleWorkerMessage(workerIndex: number, message: WorkerResult) {
    // DEBUG: show when a worker result arrives
    // logger.debug(`[WorkerPool] Worker ${workerIndex} message for task ${message.id}: ${message.error ? 'error' : 'result'}`);
    const cb = this.pending.get(message.id);
    if (cb) {
      // Schedule the callback on next tick to avoid deep synchronous promise
      // resolution chains which can lead to stack overflows when many tasks
      // complete in quick succession.
      setImmediate(() => {
        try {
          cb(message);
        } catch (e) {
          logger.warn('[WorkerPool] Callback error:', e);
        }
      });
      this.pending.delete(message.id);
    }
    // mark the worker idle
    this.idleWorkers.push(workerIndex);
    // process queue if any
    this.processQueue();
  }

  private handleWorkerError(workerIndex: number, err: unknown) {
    // Log and propagate errors to any pending tasks assigned to this worker.
    // We don't try to auto-respawn here.
    logger.warn('[WorkerPool] Worker error:', err);
  }

  private processQueue() {
    while (this.taskQueue.length > 0 && this.idleWorkers.length > 0) {
      const task = this.taskQueue.shift()!;
      const workerIndex = this.idleWorkers.shift()!;
      const worker = this.workers[workerIndex];
      if (!worker) {
        // Worker has been terminated - push back, and try again later
        this.taskQueue.unshift(task);
        continue;
      }
      // DEBUG: log task dispatch
      // logger.debug(`[WorkerPool] Posting task ${task.id} to worker ${workerIndex}`);
      worker.postMessage(task.payload);
    }
  }

  run<TResult = unknown>(payload: Record<string, unknown>): Promise<TResult> {
    return new Promise((resolve, reject) => {
      const id = this.nextTaskId++;
      this.pending.set(id, (r) => {
        if (r.error) reject(r.error);
        else resolve(r.result as TResult);
      });
      this.taskQueue.push({ id, payload: { ...payload, taskId: id } });
      this.processQueue();
    });
  }

  terminateAll() {
    for (const w of this.workers) {
      if (w) w.terminate();
    }
  }

  dispose(): void {
    for (const [id, cb] of this.pending.entries()) {
      cb({ id, result: undefined, error: new Error('WorkerPool disposed') });
    }
    this.pending.clear();
    this.taskQueue.length = 0;
    this.terminateAll();
  }
}
