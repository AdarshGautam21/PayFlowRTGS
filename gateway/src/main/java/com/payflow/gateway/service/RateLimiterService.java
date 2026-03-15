package com.payflow.gateway.service;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;

@Service
public class RateLimiterService {

    private final StringRedisTemplate redisTemplate;

    // Lua script for atomic token bucket rate limiting
    private static final String RATE_LIMIT_SCRIPT = """
        local key = KEYS[1]
        local limit = tonumber(ARGV[1])
        local window = tonumber(ARGV[2])
        local current = redis.call('GET', key)
        if current and tonumber(current) >= limit then
            return 0
        end
        local count = redis.call('INCR', key)
        if count == 1 then
            redis.call('EXPIRE', key, window)
        end
        return 1
        """;

    private final DefaultRedisScript<Long> rateLimitScript;

    public RateLimiterService(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
        this.rateLimitScript = new DefaultRedisScript<>(RATE_LIMIT_SCRIPT, Long.class);
    }

    public boolean isAllowed(String clientId, int limit, int windowSeconds) {
        try {
            String key = "rate_limit:" + clientId;
            List<String> keys = Collections.singletonList(key);
            Long result = redisTemplate.execute(
                rateLimitScript,
                keys,
                String.valueOf(limit),
                String.valueOf(windowSeconds)
            );
            return result != null && result == 1L;
        } catch (Exception e) {
            // Fail open — if Redis is down, allow the request
            return true;
        }
    }
}
