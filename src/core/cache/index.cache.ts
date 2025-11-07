import * as vscode from 'vscode';
import type { CacheProvider, Cache } from './cache';
import { InMemorySuggestionCache } from './cache.memory';
import { GlobalStateCache } from './cache.global';
import { CompositeCache } from './cache.composite';

export class ClockitCacheProvider implements CacheProvider {
  private readonly memory = new InMemorySuggestionCache();
  private readonly persistent: Cache;
  private readonly composite: Cache;

  constructor(ctx: vscode.ExtensionContext) {
    this.persistent = new GlobalStateCache(ctx, 'clockit');
    this.composite = new CompositeCache([this.memory, this.persistent]);
  }

  /** Default: memory + globalState */
  cache(name: string): Cache {
    // Namespacing handled at call sites via the `ns` parameter of Cache methods
    return this.composite;
  }

  /** If you need raw memory-only */
  memoryOnly(): Cache { return this.memory; }
  /** If you need raw persistent-only */
  persistentOnly(): Cache { return this.persistent; }
}