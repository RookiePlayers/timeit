import { createClient, RedisClientType } from 'redis';

class RedisService {
  private client: RedisClientType | null = null;
  private isConnecting = false;
  private connectionPromise: Promise<void> | null = null;
  private readonly redisUrl = process.env.REDIS_URL;
  private readonly connectTimeoutMs = Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 1000);
  private readonly availabilityTtlMs = Number(process.env.REDIS_AVAILABILITY_TTL_MS || 2000);
  private readonly unavailableCooldownMs = Number(process.env.REDIS_UNAVAILABLE_COOLDOWN_MS || 5000);
  private unavailableUntil = 0;
  private lastAvailabilityCheck = 0;
  private cachedAvailability: boolean | null = null;

  /**
   * Initialize Redis client
   */
  private async initClient(): Promise<void> {
    if (!this.redisUrl) {
      throw new Error('REDIS_URL not set');
    }
    if (this.client && this.client.isOpen) {
      return;
    }

    if (this.isConnecting && this.connectionPromise) {
      return this.connectionPromise;
    }

    this.isConnecting = true;
    this.connectionPromise = this._connect();

    try {
      await this.connectionPromise;
    } catch (err) {
      this.unavailableUntil = Date.now() + this.unavailableCooldownMs;
      throw err;
    } finally {
      this.isConnecting = false;
      this.connectionPromise = null;
    }
  }

  private async _connect(): Promise<void> {
    const redisUrl = this.redisUrl;
    if (!redisUrl) {
      throw new Error('REDIS_URL not set');
    }

    this.client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          // Reconnect after exponential backoff, max 3 seconds
          return Math.min(retries * 50, 3000);
        },
        connectTimeout: this.connectTimeoutMs,
      },
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      console.log('Redis Client Connected');
    });

    this.client.on('ready', () => {
      console.log('Redis Client Ready');
    });

    this.client.on('reconnecting', () => {
      console.log('Redis Client Reconnecting');
    });

    try {
      await this.connectWithTimeout(this.connectTimeoutMs);
    } catch (err) {
      try {
        await this.client.disconnect();
      } catch {
        // Best-effort cleanup; we'll fall back to memory.
      }
      this.client = null;
      throw err;
    }
  }

  /**
   * Get the Redis client, initializing if necessary
   */
  private async getClient(): Promise<RedisClientType> {
    if (!this.redisUrl) {
      throw new Error('REDIS_URL not set');
    }
    if (Date.now() < this.unavailableUntil) {
      throw new Error('Redis unavailable (cooldown)');
    }
    if (!this.client || !this.client.isOpen) {
      await this.initClient();
    }

    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    return this.client;
  }

  private async connectWithTimeout(timeoutMs: number): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    let timeoutId: NodeJS.Timeout | null = null;
    try {
      await Promise.race([
        this.client.connect(),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Redis connect timeout')), timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private async pingWithTimeout(timeoutMs: number): Promise<void> {
    const client = await this.getClient();
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      await Promise.race([
        client.ping(),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Redis ping timeout')), timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Check if Redis is available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.redisUrl) {
      return false;
    }

    const now = Date.now();
    if (this.cachedAvailability !== null && now - this.lastAvailabilityCheck < this.availabilityTtlMs) {
      return this.cachedAvailability;
    }
    if (now < this.unavailableUntil) {
      this.cachedAvailability = false;
      this.lastAvailabilityCheck = now;
      return false;
    }

    try {
      await this.pingWithTimeout(this.connectTimeoutMs);
      this.cachedAvailability = true;
      this.lastAvailabilityCheck = now;
      return true;
    } catch (err) {
      console.warn('Redis is not available:', err);
      this.cachedAvailability = false;
      this.lastAvailabilityCheck = now;
      this.unavailableUntil = now + this.unavailableCooldownMs;
      return false;
    }
  }

  /**
   * Get a value from Redis
   */
  async get(key: string): Promise<string | null> {
    try {
      const client = await this.getClient();
      return await client.get(key);
    } catch (err) {
      console.error('Redis GET error:', err);
      return null;
    }
  }

  /**
   * Get and parse JSON value from Redis
   */
  async getJSON<T = unknown>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch (err) {
      console.error('Redis JSON parse error:', err);
      return null;
    }
  }

  /**
   * Set a value in Redis with optional TTL
   */
  async set(key: string, value: string, ttlMs?: number): Promise<boolean> {
    try {
      const client = await this.getClient();

      if (ttlMs) {
        await client.set(key, value, {
          PX: ttlMs, // milliseconds
        });
      } else {
        await client.set(key, value);
      }

      return true;
    } catch (err) {
      console.error('Redis SET error:', err);
      return false;
    }
  }

  /**
   * Set a JSON value in Redis with optional TTL
   */
  async setJSON(key: string, value: unknown, ttlMs?: number): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      return await this.set(key, serialized, ttlMs);
    } catch (err) {
      console.error('Redis JSON stringify error:', err);
      return false;
    }
  }

  /**
   * Delete a key from Redis
   */
  async del(key: string): Promise<boolean> {
    try {
      const client = await this.getClient();
      await client.del(key);
      return true;
    } catch (err) {
      console.error('Redis DEL error:', err);
      return false;
    }
  }

  /**
   * Delete multiple keys matching a pattern
   */
  async delPattern(pattern: string): Promise<number> {
    try {
      const client = await this.getClient();
      const keys = await client.keys(pattern);

      if (keys.length === 0) {
        return 0;
      }

      await client.del(keys);
      return keys.length;
    } catch (err) {
      console.error('Redis DEL pattern error:', err);
      return 0;
    }
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const client = await this.getClient();
      const result = await client.exists(key);
      return result === 1;
    } catch (err) {
      console.error('Redis EXISTS error:', err);
      return false;
    }
  }

  /**
   * Get remaining TTL for a key in milliseconds
   */
  async ttl(key: string): Promise<number> {
    try {
      const client = await this.getClient();
      const ttl = await client.pTTL(key); // returns milliseconds
      return ttl;
    } catch (err) {
      console.error('Redis TTL error:', err);
      return -1;
    }
  }

  /**
   * Increment a counter
   */
  async incr(key: string): Promise<number> {
    try {
      const client = await this.getClient();
      return await client.incr(key);
    } catch (err) {
      console.error('Redis INCR error:', err);
      return 0;
    }
  }

  /**
   * Get database size (number of keys)
   */
  async dbSize(): Promise<number> {
    try {
      const client = await this.getClient();
      return await client.dbSize();
    } catch (err) {
      console.error('Redis DBSIZE error:', err);
      return 0;
    }
  }

  /**
   * Flush all data (use with caution!)
   */
  async flushAll(): Promise<boolean> {
    try {
      const client = await this.getClient();
      await client.flushAll();
      return true;
    } catch (err) {
      console.error('Redis FLUSHALL error:', err);
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    if (this.client && this.client.isOpen) {
      await this.client.quit();
      this.client = null;
    }
  }

  /**
   * Get client info for debugging
   */
  async getInfo(): Promise<Record<string, unknown>> {
    try {
      const client = await this.getClient();
      const info = await client.info();
      const dbSize = await this.dbSize();

      return {
        connected: this.client?.isOpen || false,
        dbSize,
        info: info.substring(0, 200) + '...', // Truncate for brevity
      };
    } catch (err) {
      return {
        connected: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }
}

// Singleton instance
export const redisService = new RedisService();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing Redis connection');
  await redisService.disconnect();
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing Redis connection');
  await redisService.disconnect();
});
