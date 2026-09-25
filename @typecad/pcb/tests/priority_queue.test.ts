import { describe, it, expect } from 'vitest';
import { PriorityQueue } from '../src/routing/shared/priority_queue.js';

describe('PriorityQueue', () => {
  it('should start empty', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    expect(pq.size()).toBe(0);
    expect(pq.peek()).toBeUndefined();
    expect(pq.pop()).toBeUndefined();
  });

  it('should maintain min-heap order', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    pq.push(5);
    pq.push(1);
    pq.push(3);
    pq.push(2);
    pq.push(4);

    expect(pq.pop()).toBe(1);
    expect(pq.pop()).toBe(2);
    expect(pq.pop()).toBe(3);
    expect(pq.pop()).toBe(4);
    expect(pq.pop()).toBe(5);
    expect(pq.pop()).toBeUndefined();
  });

  it('should maintain max-heap order with reversed comparator', () => {
    const pq = new PriorityQueue<number>((a, b) => b - a);
    pq.push(1);
    pq.push(5);
    pq.push(3);

    expect(pq.pop()).toBe(5);
    expect(pq.pop()).toBe(3);
    expect(pq.pop()).toBe(1);
  });

  it('should peek without removing', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    pq.push(10);
    pq.push(5);
    expect(pq.peek()).toBe(5);
    expect(pq.size()).toBe(2);
    expect(pq.peek()).toBe(5);
  });

  it('should handle equal-priority items', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    pq.push(3);
    pq.push(3);
    pq.push(3);
    expect(pq.pop()).toBe(3);
    expect(pq.pop()).toBe(3);
    expect(pq.pop()).toBe(3);
    expect(pq.size()).toBe(0);
  });

  it('should handle objects with custom comparator', () => {
    type Item = { cost: number; name: string };
    const pq = new PriorityQueue<Item>((a, b) => a.cost - b.cost);
    pq.push({ cost: 10, name: 'expensive' });
    pq.push({ cost: 1, name: 'cheap' });
    pq.push({ cost: 5, name: 'mid' });

    expect(pq.pop()?.name).toBe('cheap');
    expect(pq.pop()?.name).toBe('mid');
    expect(pq.pop()?.name).toBe('expensive');
  });

  it('should handle intermixed push and pop', () => {
    const pq = new PriorityQueue<number>((a, b) => a - b);
    pq.push(5);
    pq.push(1);
    expect(pq.pop()).toBe(1);
    pq.push(3);
    pq.push(0);
    expect(pq.pop()).toBe(0);
    expect(pq.pop()).toBe(3);
    expect(pq.pop()).toBe(5);
  });
});
