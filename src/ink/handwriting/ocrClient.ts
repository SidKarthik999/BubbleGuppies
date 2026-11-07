// Main-thread client for the handwriting worker: lazy model load with
// progress, one read at a time (the model is CPU-bound), observable status.

import type { OcrRequest, OcrResponse } from "./ocrWorker";

export type OcrStatus =
  | { state: "off" }
  | { state: "loading"; progress: number } // 0..1, download progress
  | { state: "ready" }
  | { state: "reading"; queued: number }
  | { state: "error"; message: string };

type Pending = { id: string; png: Blob; resolve: (text: string) => void; reject: (err: Error) => void };

export class OcrClient {
  status: OcrStatus = { state: "off" };
  private worker: Worker | null = null;
  private queue: Pending[] = [];
  private active: Pending | null = null;
  private listeners = new Set<() => void>();
  private ready = false;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getStatus = () => this.status;

  private set(status: OcrStatus) {
    this.status = status;
    for (const fn of this.listeners) fn();
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL("./ocrWorker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<OcrResponse>) => this.onMessage(e.data);
    w.onerror = (e) => {
      this.fail(e.message || "The handwriting model crashed.");
      this.worker?.terminate();
      this.worker = null;
      this.ready = false;
    };
    this.worker = w;
    this.set({ state: "loading", progress: 0 });
    this.send({ type: "load" });
    return w;
  }

  private send(msg: OcrRequest) {
    this.worker?.postMessage(msg);
  }

  private onMessage(msg: OcrResponse) {
    if (msg.type === "progress") {
      if (!this.ready) this.set({ state: "loading", progress: msg.total ? msg.loaded / msg.total : 0 });
    } else if (msg.type === "ready") {
      this.ready = true;
      this.set(this.active || this.queue.length ? { state: "reading", queued: this.queue.length } : { state: "ready" });
    } else if (msg.type === "result") {
      if (this.active?.id === msg.id) {
        this.active.resolve(msg.text);
        this.active = null;
      }
      this.pump();
    } else if (msg.type === "error") {
      if (msg.id && this.active?.id === msg.id) {
        this.active.reject(new Error(msg.message));
        this.active = null;
        this.pump();
      } else {
        this.fail(msg.message);
      }
    }
  }

  private fail(message: string) {
    for (const p of [this.active, ...this.queue]) p?.reject(new Error(message));
    this.active = null;
    this.queue = [];
    this.set({ state: "error", message });
  }

  private pump() {
    if (this.active || this.queue.length === 0) {
      if (!this.active && this.ready) this.set({ state: "ready" });
      return;
    }
    this.active = this.queue.shift()!;
    if (this.ready) this.set({ state: "reading", queued: this.queue.length });
    this.send({ type: "read", id: this.active.id, png: this.active.png });
  }

  /** Starts downloading the model ahead of the first read. */
  warmUp() {
    this.ensureWorker();
  }

  read(png: Blob): Promise<string> {
    this.ensureWorker();
    return new Promise((resolve, reject) => {
      this.queue.push({ id: Math.random().toString(36).slice(2), png, resolve, reject });
      this.pump();
    });
  }

  /** Clears queued (not yet started) reads, e.g. when lines changed again. */
  clearQueue() {
    for (const p of this.queue) p.reject(new Error("superseded"));
    this.queue = [];
  }

  turnOff() {
    this.clearQueue();
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.active = null;
    this.set({ state: "off" });
  }
}
