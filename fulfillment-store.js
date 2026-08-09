'use strict';

const { createClient } = require('redis');

const DEFAULT_CLAIM_TTL_MS = 400 * 24 * 60 * 60 * 1000;

class RedisFulfillmentStore {
  constructor(redisUrl, options = {}) {
    if (!redisUrl) throw new Error('REDIS_URL absent');
    this.prefix = options.prefix || 'achzod:fulfillment:v3';
    this.claimTtlMs = options.claimTtlMs || DEFAULT_CLAIM_TTL_MS;
    this.client = options.client || createClient({
      url: redisUrl,
      socket: {
        connectTimeout: options.connectTimeoutMs || 5000,
        reconnectStrategy(retries) {
          return retries >= 3 ? false : Math.min(100 * (retries + 1), 500);
        },
      },
    });
    this.connectPromise = null;
    this.client.on('error', (error) => {
      console.error(JSON.stringify({
        component: 'fulfillment_store',
        event: 'redis_error',
        error: error.message,
      }));
    });
  }

  redisKey(key) {
    return `${this.prefix}:${key}`;
  }

  async connect() {
    if (this.client.isReady) return;
    if (!this.connectPromise) {
      this.connectPromise = this.client.connect().finally(() => {
        this.connectPromise = null;
      });
    }
    await this.connectPromise;
  }

  async claim({ key, owner, nowMs = Date.now() }) {
    await this.connect();
    const value = JSON.stringify({
      status: 'claimed',
      owner,
      claimedAt: new Date(nowMs).toISOString(),
    });
    const result = await this.client.set(this.redisKey(key), value, {
      NX: true,
      PX: this.claimTtlMs,
    });
    return result === 'OK' ? { status: 'acquired', owner } : { status: 'duplicate' };
  }

  async close() {
    if (this.client.isOpen) await this.client.close();
  }
}

class MemoryFulfillmentStore {
  constructor(sharedState = new Map()) {
    this.state = sharedState;
  }

  async claim({ key, owner, nowMs = Date.now() }) {
    if (this.state.has(key)) return { status: 'duplicate' };
    this.state.set(key, {
      status: 'claimed',
      owner,
      claimedAt: new Date(nowMs).toISOString(),
    });
    return { status: 'acquired', owner };
  }

  snapshot(key) {
    const value = this.state.get(key);
    return value ? { ...value } : null;
  }
}

module.exports = {
  DEFAULT_CLAIM_TTL_MS,
  MemoryFulfillmentStore,
  RedisFulfillmentStore,
};
