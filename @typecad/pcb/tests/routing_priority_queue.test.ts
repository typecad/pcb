import { describe, it, expect } from 'vitest';
import { PriorityQueue } from '../src/routing/shared/priority_queue.js';

describe('PriorityQueue', () => {
  it('should return undefined when popping empty queue', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    expect(pq.pop()).toBeUndefined();
    expect(pq.peek()).toBeUndefined();
    expect(pq.size()).toBe(0);
  });

  it('should push and pop a single item', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    pq.push(42);
    expect(pq.size()).toBe(1);
    expect(pq.peek()).toBe(42);
    expect(pq.pop()).toBe(42);
    expect(pq.size()).toBe(0);
  });

  it('should maintain min-heap order', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    pq.push(5);
    pq.push(2);
    pq.push(8);
    pq.push(1);
    pq.push(3);
    expect(pq.pop()).toBe(1);
    expect(pq.pop()).toBe(2);
    expect(pq.pop()).toBe(3);
    expect(pq.pop()).toBe(5);
    expect(pq.pop()).toBe(8);
  });

  it('should support max-heap via comparator', () => {
    const pq = new PriorityQueue<number>((a, b) => b - a);
    pq.push(5);
    pq.push(2);
    pq.push(8);
    expect(pq.pop()).toBe(8);
    expect(pq.pop()).toBe(5);
    expect(pq.pop()).toBe(2);
  });

  it('should handle equal-priority items', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    pq.push(3);
    pq.push(3);
    pq.push(3);
    expect(pq.pop()).toBe(3);
    expect(pq.pop()).toBe(3);
    expect(pq.pop()).toBe(3);
  });

  it('should clear the queue', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    pq.push(1);
    pq.push(2);
    pq.push(3);
    pq.clear();
    expect(pq.size()).toBe(0);
    expect(pq.pop()).toBeUndefined();
  });

  it('should handle objects with priority field', () => {
    interface Item {
      name: string;
      cost: number;
    }
    const pq = new PriorityQueue<Item>((a, b) => a.cost - b.cost);
    pq.push({ name: 'C', cost: 30 });
    pq.push({ name: 'A', cost: 10 });
    pq.push({ name: 'B', cost: 20 });
    expect(pq.pop()!.name).toBe('A');
    expect(pq.pop()!.name).toBe('B');
    expect(pq.pop()!.name).toBe('C');
  });

  it('should maintain heap property after interleaved push/pop', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    pq.push(5);
    pq.push(3);
    expect(pq.pop()).toBe(3);
    pq.push(1);
    pq.push(7);
    expect(pq.pop()).toBe(1);
    expect(pq.pop()).toBe(5);
    expect(pq.pop()).toBe(7);
  });

  it('should handle large number of items', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    const count = 1000;
    for (let i = count; i > 0; i--) {
      pq.push(i);
    }
    for (let i = 1; i <= count; i++) {
      expect(pq.pop()).toBe(i);
    }
  });
});
