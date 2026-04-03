const Redis = require('ioredis');

/**
 * Sliding window rate limiter with Redis fallback to in-memory
 * 100 requests per minute per IP
 */
function createRateLimiter(maxRequests = 100, windowMs = 60000) {
  let redis = null;
  let useRedis = false;
  const inMemoryStore = new Map();

  // Try Redis connection
  try {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 2) return null;
        return Math.min(times * 200, 1000);
      },
    });
    redis.on('error', () => {}); // Suppress connection errors
    redis.connect().then(() => {
      useRedis = true;
      console.log('✅ Rate limiter using Redis');
    }).catch(() => {
      console.log('⚠️  Rate limiter using in-memory store');
    });
  } catch {
    console.log('⚠️  Rate limiter using in-memory store');
  }

  // Cleanup in-memory store every minute
  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of inMemoryStore) {
      if (now - data.windowStart > windowMs) {
        inMemoryStore.delete(key);
      }
    }
  }, 60000);

  return async (req, res, next) => {
    const clientKey = req.ip || req.connection.remoteAddress || 'unknown';
    const rateLimitKey = `ratelimit:${clientKey}`;

    try {
      let currentCount;

      if (useRedis && redis) {
        // Redis sliding window
        const now = Date.now();
        const windowStart = now - windowMs;

        await redis.zremrangebyscore(rateLimitKey, 0, windowStart);
        currentCount = await redis.zcard(rateLimitKey);

        if (currentCount >= maxRequests) {
          const ttl = await redis.pttl(rateLimitKey);
          res.set({
            'X-RateLimit-Limit': maxRequests,
            'X-RateLimit-Remaining': 0,
            'X-RateLimit-Reset': Math.ceil((now + (ttl > 0 ? ttl : windowMs)) / 1000),
            'Retry-After': Math.ceil((ttl > 0 ? ttl : windowMs) / 1000),
          });
          return res.status(429).json({ error: 'Too many requests. Please try again later.' });
        }

        await redis.zadd(rateLimitKey, now, `${now}-${Math.random()}`);
        await redis.pexpire(rateLimitKey, windowMs);

        res.set({
          'X-RateLimit-Limit': maxRequests,
          'X-RateLimit-Remaining': Math.max(0, maxRequests - currentCount - 1),
        });
      } else {
        // In-memory fallback
        const now = Date.now();
        let data = inMemoryStore.get(clientKey);

        if (!data || now - data.windowStart > windowMs) {
          data = { windowStart: now, count: 0 };
          inMemoryStore.set(clientKey, data);
        }

        if (data.count >= maxRequests) {
          const retryAfter = Math.ceil((data.windowStart + windowMs - now) / 1000);
          res.set({
            'X-RateLimit-Limit': maxRequests,
            'X-RateLimit-Remaining': 0,
            'Retry-After': retryAfter,
          });
          return res.status(429).json({ error: 'Too many requests. Please try again later.' });
        }

        data.count++;
        res.set({
          'X-RateLimit-Limit': maxRequests,
          'X-RateLimit-Remaining': Math.max(0, maxRequests - data.count),
        });
      }
    } catch (err) {
      // On rate limiter failure, let request through
      console.error('[RATE-LIMIT] Error:', err.message);
    }

    next();
  };
}

module.exports = { createRateLimiter };
