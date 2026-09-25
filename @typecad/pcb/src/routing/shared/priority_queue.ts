export class PriorityQueue<T> {
  private heap: T[] = [];
  private compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  size(): number {
    return this.heap.length;
  }

  clear(): void {
    this.heap.length = 0;
  }

  peek(): T | undefined {
    return this.heap[0];
  }

  push(item: T): void {
    this.heap.push(item);
    this.siftUp(this.heap.length - 1);
  }

  pop(): T | undefined {
    const n = this.heap.length;
    if (n === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop() as T;
    if (n > 1) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private siftUp(idx: number): void {
    const item = this.heap[idx];
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      const parentItem = this.heap[parent];
      if (this.compare(item, parentItem) < 0) {
        this.heap[idx] = parentItem;
        idx = parent;
      } else {
        break;
      }
    }
    this.heap[idx] = item;
  }

  private siftDown(idx: number): void {
    const n = this.heap.length;
    const item = this.heap[idx];
    const halfN = n >>> 1;

    while (idx < halfN) {
      let childIdx = (idx << 1) + 1;
      let child = this.heap[childIdx];
      const rightIdx = childIdx + 1;

      if (rightIdx < n && this.compare(this.heap[rightIdx], child) < 0) {
        childIdx = rightIdx;
        child = this.heap[rightIdx];
      }

      if (this.compare(item, child) <= 0) {
        break;
      }

      this.heap[idx] = child;
      idx = childIdx;
    }
    this.heap[idx] = item;
  }
}
