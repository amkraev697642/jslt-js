// Port of impl/BoundedCache.java — a Map that evicts its oldest entry once
// past a size limit, so the regexp/pattern caches don't grow unboundedly.

export class BoundedCache {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.map = new Map();
  }

  get(key) { return this.map.get(key); }

  put(key, value) {
    this.map.set(key, value);
    if (this.map.size > this.maxSize) {
      this.map.delete(this.map.keys().next().value); // evict the oldest entry
    }
  }
}
