import { openDB } from "idb";
import type { IDBPDatabase } from "idb";
import { tensor4d, type Tensor4D } from "@tensorflow/tfjs";

import { LRUCache } from "./lruCache";
import { parseError } from "../../utils";
import type {
  CacheOptions,
  IStorageService,
  StorageResult,
  StorageUsage,
  StoredItemData,
  StoredItemReference,
  ChannelStorageInput,
  StoredChannelData,
  StorageInput,
} from "./types";
import {
  DB_NAME,
  DB_VERSION,
  STORES,
  type ShapeArray,
  type StoreName,
} from "../../types";
import type { ChannelColor } from "@/state/types";

const DEFAULT_CACHE_OPTIONS: CacheOptions = {
  maxMemoryBytes: 500 * 1024 * 1024, // 500MB
  persistAcrossSessions: true,
};

/**
 * TensorStorageService
 *
 * Manages persistent storage of tensor data in IndexedDB with an in-memory
 * LRU cache for fast access. This service replaces storing Tensor4D objects
 * directly in Redux state.
 *
 * Key responsibilities:
 * - Store/retrieve tensor data from IndexedDB
 * - Maintain LRU cache for frequently accessed tensors
 * - Track storage usage and provide cleanup utilities
 * - Convert between ArrayBuffer (storage) and Tensor4D (usage)
 *
 * Usage:
 * ```typescript
 * const storage = TensorStorageService.getInstance();
 *
 *  Store a tensor
 * const ref = await storage.store('image-123', tensorData, STORES.IMAGE_DATA);
 *
 *  Retrieve as Tensor4D
 * const tensor = await storage.retrieveAsTensor('image-123', STORES.IMAGE_DATA);
 *
 *  Don't forget to dispose when done!
 * tensor?.dispose();
 * ```
 */

export class StorageService implements IStorageService {
  private static instance: StorageService | null = null;

  private db: IDBPDatabase | null = null;
  private cache: LRUCache<StoredChannelData>;
  private options: CacheOptions;
  private initPromise: Promise<void> | null = null;

  private constructor(options: Partial<CacheOptions> = {}) {
    this.options = { ...DEFAULT_CACHE_OPTIONS, ...options };
    this.cache = new LRUCache<StoredChannelData>(this.options.maxMemoryBytes);
  }

  // ===========================================================================
  // PUBLIC API: BEGIN
  // ===========================================================================

  /**
   * Get singleton instance
   */
  static getInstance(options?: Partial<CacheOptions>): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService(options);
    }
    return StorageService.instance;
  }

  /**
   * Reset instance (for testing)
   */
  static resetInstance(): void {
    if (StorageService.instance) {
      StorageService.instance.close();
      StorageService.instance = null;
    }
  }

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.initDB();
    await this.initPromise;
  }

  private async initDB(): Promise<void> {
    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORES.CHANNEL_DATA)) {
          db.createObjectStore(STORES.CHANNEL_DATA, { keyPath: "id" });
        }
      },
    });
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.cache.clear();
    this.initPromise = null;
  }

  // ── Core Storage ───────────────────────────────────────────────────

  async store(
    id: string,
    data: ChannelStorageInput,
    storeName: StoreName,
  ): Promise<StorageResult<StoredItemReference>> {
    try {
      await this.init();
      const now = Date.now();
      const byteSize = data.data.byteLength + data.histogram.byteLength;

      const storedData: StoredChannelData = {
        ...data,
        byteSize,
        createdAt: now,
        lastAccessedAt: now,
      };

      // Store in IndexedDB
      await this.db!.put(storeName, storedData);

      // Also add to cache
      this.cache.set(id, storedData, byteSize);

      const reference: StoredItemReference = {
        storageId: id,
        storeName,
        width: data.width,
        height: data.height,
        dtype: data.dtype,
        byteSize,
      };
      return { success: true, data: reference };
    } catch (error) {
      return {
        success: false,
        error: parseError(error),
      };
    }
  }

  async storeBatch(
    items: Array<StorageInput>,
  ): Promise<StorageResult<StoredItemReference[]>> {
    try {
      await this.init();

      const now = Date.now();
      const references: StoredItemReference[] = [];

      // Group by store for efficient transactions
      const byStore = new Map<StoreName, StoredChannelData[]>();

      for (const item of items) {
        const byteSize = item.data.data.byteLength + item.data.data.byteLength;

        const storedData: StoredChannelData = {
          ...item.data,
          byteSize,
          createdAt: now,
          lastAccessedAt: now,
        };

        if (!byStore.has(item.storeName)) {
          byStore.set(item.storeName, []);
        }
        byStore.get(item.storeName)!.push(storedData);

        // Add to cache
        this.cache.set(item.id, storedData, byteSize);

        references.push({
          storageId: item.id,
          storeName: item.storeName,
          width: item.data.width,
          height: item.data.height,
          dtype: item.data.dtype,
          byteSize,
        });
      }

      for (const [storeName, dataItems] of byStore) {
        const tx = this.db!.transaction(storeName, "readwrite");
        await Promise.all([
          ...dataItems.map((item) => tx.store.put(item)),
          tx.done,
        ]);
      }
      return { success: true, data: references };
    } catch (error) {
      return {
        success: false,
        error: parseError(error),
      };
    }
  }

  // ── Retrieval ──────────────────────────────────────────────────────

  async retrieve(
    id: string,
    storeName: StoreName,
  ): Promise<StorageResult<StoredChannelData>> {
    try {
      const cached = this.cache.get(id);
      if (cached) {
        return { success: true, data: cached };
      }

      await this.init();

      const data = await this.db!.get(storeName, id);

      if (!data) {
        return { success: false, error: new Error(`Tensor not found ${id}`) };
      }

      // Update last accessed time
      data.lastAccessedAt = Date.now();
      await this.db!.put(storeName, data);

      // Add to cache
      this.cache.set(id, data, data.byteSize);

      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: parseError(error),
      };
    }
  }

  async retrieveBatch(
    items: { id: string; storeName: StoreName }[],
  ): Promise<StorageResult<Map<string, StoredChannelData>>> {
    const channelDataMap: Map<string, StoredChannelData> = new Map();
    try {
      await this.init();

      // Group by store
      const byStore = new Map<StoreName, string[]>();
      for (const item of items) {
        const cached = this.cache.get(item.id);
        if (cached) {
          channelDataMap.set(item.id, cached);
          continue;
        }
        if (!byStore.has(item.storeName)) {
          byStore.set(item.storeName, []);
        }
        byStore.get(item.storeName)!.push(item.id);
      }

      // retrieve from each store
      for (const [storeName, ids] of byStore) {
        const tx = this.db!.transaction(storeName, "readonly");
        const fetched = await Promise.all(ids.map((id) => tx.store.get(id)));
        await tx.done;

        for (let i = 0; i < ids.length; i++) {
          const data = fetched[i] as StoredChannelData | undefined;
          if (data) {
            data.lastAccessedAt = Date.now();
            this.cache.set(data.id, data, data.byteSize);
            channelDataMap.set(data.id, data);
          }
        }
      }

      return { success: true, data: channelDataMap };
    } catch (error) {
      return {
        success: false,
        error: parseError(error),
      };
    }
  }

  async retrieveAsTensor(
    id: string,
    storeName: StoreName,
  ): Promise<Tensor4D | null> {
    const result = await this.retrieve(id, storeName);

    if (!result.success) {
      return null;
    }

    const { data, dtype, width, height } = result.data;

    const shape: ShapeArray = [1, height, width, 1];
    // Create typed array view and determine TF.js dtype
    // TF.js only supports: "float32" | "int32" | "bool" | "complex64" | "string"
    // We map our storage dtype to TF.js compatible dtype
    switch (dtype) {
      case "float32": {
        const typedArray = new Float32Array(data);
        return tensor4d(typedArray, shape, "float32");
      }
      case "int32": {
        const typedArray = new Int32Array(data);
        return tensor4d(typedArray, shape, "int32");
      }
      case "uint8": {
        // uint8 stored efficiently but reconstructed as int32 for TF.js
        const typedArray = new Uint8Array(data);
        return tensor4d(typedArray, shape, "int32");
      }
    }
  }

  // ── Deletion ───────────────────────────────────────────────────────

  async delete(id: string, storeName: StoreName): Promise<StorageResult<void>> {
    try {
      await this.init();
      await this.db!.delete(storeName, id);
      this.cache.delete(id);

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: parseError(error),
      };
    }
  }

  async deleteBatch(
    items: Array<{ id: string; storeName: StoreName }>,
  ): Promise<StorageResult<void>> {
    try {
      await this.init();

      // Group by store
      const byStore = new Map<StoreName, string[]>();
      for (const item of items) {
        if (!byStore.has(item.storeName)) {
          byStore.set(item.storeName, []);
        }
        byStore.get(item.storeName)!.push(item.id);
        this.cache.delete(item.id);
      }

      // Delete from each store
      for (const [storeName, ids] of byStore) {
        const tx = this.db!.transaction(storeName, "readwrite");
        await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
      }

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: parseError(error),
      };
    }
  }

  // ── Cache Management ───────────────────────────────────────────────

  async preload(ids: string[], storeName: StoreName): Promise<void> {
    await this.init();

    for (const id of ids) {
      if (!this.cache.has(id)) {
        await this.retrieve(id, storeName);
      }
    }
  }

  evictFromCache(ids: string[]): void {
    for (const id of ids) {
      this.cache.delete(id);
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  setCacheLimit(maxBytes: number): void {
    this.options.maxMemoryBytes = maxBytes;
    this.cache.setMaxBytes(maxBytes);
  }

  // ── Storage Management ─────────────────────────────────────────────

  async getUsage(): Promise<StorageUsage> {
    await this.init();

    let totalSize = 0;
    let itemCount = 0;

    for (const storeName of [STORES.IMAGE_DATA, STORES.SERIES_DATA]) {
      const tx = this.db!.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);

      let cursor = await store.openCursor();
      while (cursor) {
        totalSize += (cursor.value as StoredItemData).byteSize;
        itemCount++;
        cursor = await cursor.continue();
      }
    }

    let available = 0;
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      available = (estimate.quota ?? 0) - (estimate.usage ?? 0);
    }

    const cacheStats = this.cache.getStats();

    return {
      used: totalSize,
      available,
      itemCount,
      cacheHitRate: cacheStats.hitRate,
    };
  }

  async getStoredIds(storeName: StoreName): Promise<string[]> {
    await this.init();
    return this.db!.getAllKeys(storeName) as Promise<string[]>;
  }

  async clearAll(): Promise<StorageResult<void>> {
    try {
      await this.init();

      for (const storeName of [STORES.IMAGE_DATA, STORES.SERIES_DATA]) {
        await this.db!.clear(storeName);
      }
      this.cache.clear();

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: parseError(error),
      };
    }
  }

  async clearOlderThan(
    maxAgeMs: number,
    storeName: StoreName,
  ): Promise<StorageResult<number>> {
    try {
      await this.init();

      const cutoff = Date.now() - maxAgeMs;

      let deletedCount = 0;

      const tx = this.db!.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);

      let cursor = await store.openCursor();
      while (cursor) {
        const data = cursor.value as StoredItemData;
        if (data.lastAccessedAt < cutoff) {
          await cursor.delete();
          this.cache.delete(data.id);
          deletedCount++;
        }
        cursor = await cursor.continue();
      }

      await tx.done;

      return { success: true, data: deletedCount };
    } catch (error) {
      return { success: false, error: parseError(error) };
    }
  }
}
