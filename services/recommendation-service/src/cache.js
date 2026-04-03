const Redis = require('ioredis');

let redis = null;
let isConnected = false;

async function connectRedis() {
  try {
    const redisUrl = process.env.REDIS_URL || process.env.KEY_VALUE_URL || process.env.KEY_VALUE_REDIS_URL;
    const redisOptions = {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 2) return null; // Stop retrying
        return Math.min(times * 200, 1000);
      },
    };

    redis = redisUrl
      ? new Redis(redisUrl, redisOptions)
      : new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          ...redisOptions,
        });

    // Prevent unhandled error crashes
    redis.on('error', (err) => {
      if (isConnected) {
        console.warn('⚠️  Redis connection lost');
        isConnected = false;
      }
    });
    await Promise.race([
      redis.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 3000)),
    ]);
    await redis.ping();
    isConnected = true;
  } catch (err) {
    console.warn('⚠️  Redis not available, caching disabled');
    isConnected = false;
    if (redis) {
      try { redis.disconnect(); } catch {}
      redis = null;
    }
  }
}

async function getCached(key) {
  if (!isConnected || !redis) return null;
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    return null;
  }
}

async function setCache(key, value, ttlSeconds = 1800) {
  if (!isConnected || !redis) return;
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    console.error('[REDIS] Cache set failed:', err.message);
  }
}

async function invalidateCache(pattern) {
  if (!isConnected || !redis) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    console.error('[REDIS] Cache invalidation failed:', err.message);
  }
}

module.exports = { connectRedis, getCached, setCache, invalidateCache, getRedis: () => redis };
