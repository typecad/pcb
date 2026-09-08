export class ReferenceCounter {
  private counters: Map<string, number> = new Map();
  private usedReferences: Set<string> = new Set();

  private static normalizeKey(reference: string): string {
    return reference.toLowerCase();
  }

  getNextReference(prefix: string): string {
    const normalizedPrefix = prefix.toLowerCase();
    let nextRef: string;
    let nextRefNormalized: string;
    let currentCount = this.counters.get(normalizedPrefix) || 0;

    do {
      currentCount++;
      nextRef = `${prefix}${currentCount}`;
      nextRefNormalized = ReferenceCounter.normalizeKey(nextRef);
    } while (this.usedReferences.has(nextRefNormalized));

    this.counters.set(normalizedPrefix, currentCount);
    this.usedReferences.add(nextRefNormalized);
    return nextRef;
  }

  setReference(reference: string): boolean {
    const normalized = ReferenceCounter.normalizeKey(reference);
    if (this.usedReferences.has(normalized)) {
      return false;
    }

    const prefixMatch = reference.match(/^[#]?[a-zA-Z]+/);
    const numberMatch = reference.match(/\d+/);
    if (!prefixMatch || !numberMatch) {
      return false;
    }

    const prefix = prefixMatch[0].toLowerCase();
    const number = parseInt(numberMatch[0], 10);

    this.usedReferences.add(normalized);
    const currentCount = this.counters.get(prefix) || 0;
    if (number > currentCount) {
      this.counters.set(prefix, number);
    }
    return true;
  }

  reset(): void {
    this.counters.clear();
    this.usedReferences.clear();
  }
}
