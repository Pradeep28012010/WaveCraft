import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  checkRateLimit,
  isAllowedAudioProxyUrl,
  getCached,
  setCached,
  ipRequestCounts,
  RATE_LIMIT_WINDOW_MS,
  MAX_REQUESTS_PER_WINDOW
} from '../api/lib/cache.js';
import handler from '../api/music.js';

describe('WaveCraft Serverless API Gateway & Security Tests', () => {
  describe('SSRF Protection (isAllowedAudioProxyUrl)', () => {
    it('blocks local and loopback targets', () => {
      assert.strictEqual(isAllowedAudioProxyUrl('http://127.0.0.1/admin'), false);
      assert.strictEqual(isAllowedAudioProxyUrl('http://localhost:3000/api'), false);
      assert.strictEqual(isAllowedAudioProxyUrl('http://[::1]/secret'), false);
    });

    it('blocks cloud metadata endpoints', () => {
      assert.strictEqual(isAllowedAudioProxyUrl('http://169.254.169.254/latest/meta-data/'), false);
      assert.strictEqual(isAllowedAudioProxyUrl('http://169.254.169.254/computeMetadata/v1/'), false);
    });

    it('blocks private internal subnets', () => {
      assert.strictEqual(isAllowedAudioProxyUrl('http://10.0.0.1/internal'), false);
      assert.strictEqual(isAllowedAudioProxyUrl('http://192.168.1.1/router'), false);
      assert.strictEqual(isAllowedAudioProxyUrl('http://service.internal/db'), false);
      assert.strictEqual(isAllowedAudioProxyUrl('http://app.local/'), false);
    });

    it('blocks non-whitelisted third-party domains', () => {
      assert.strictEqual(isAllowedAudioProxyUrl('https://evil-hacker.com/malicious.mp3'), false);
      assert.strictEqual(isAllowedAudioProxyUrl('https://random-site.org/audio.wav'), false);
    });

    it('allows verified music and streaming CDNs', () => {
      assert.strictEqual(isAllowedAudioProxyUrl('https://rr1---sn-4g5ednss.googlevideo.com/videoplayback?id=123'), true);
      assert.strictEqual(isAllowedAudioProxyUrl('https://c.saavncdn.com/999/Sample-Song.mp4'), true);
      assert.strictEqual(isAllowedAudioProxyUrl('https://audio-ssl.itunes.apple.com/itunes-assets/Music.m4a'), true);
      assert.strictEqual(isAllowedAudioProxyUrl('https://i.ytimg.com/vi/abc/hqdefault.jpg'), true);
    });

    it('handles malformed URLs safely without throwing', () => {
      assert.strictEqual(isAllowedAudioProxyUrl(''), false);
      assert.strictEqual(isAllowedAudioProxyUrl('not_a_url'), false);
      assert.strictEqual(isAllowedAudioProxyUrl('javascript:alert(1)'), false);
    });
  });

  describe('Sliding-Window Rate Limiting (checkRateLimit)', () => {
    it('allows normal traffic within rate limit window', () => {
      const testIp = '198.51.100.1';
      ipRequestCounts.delete(testIp);
      assert.strictEqual(checkRateLimit(testIp), true);
      assert.strictEqual(checkRateLimit(testIp), true);
    });

    it('throttles when exceeding maximum requests per window', () => {
      const floodIp = '203.0.113.42';
      ipRequestCounts.set(floodIp, {
        count: MAX_REQUESTS_PER_WINDOW,
        resetAt: Date.now() + RATE_LIMIT_WINDOW_MS
      });
      assert.strictEqual(checkRateLimit(floodIp), false);
    });

    it('isolates rate limits per distinct IP address', () => {
      const ipA = '192.0.2.1';
      const ipB = '192.0.2.2';
      ipRequestCounts.set(ipA, { count: MAX_REQUESTS_PER_WINDOW, resetAt: Date.now() + 50000 });
      ipRequestCounts.delete(ipB);

      assert.strictEqual(checkRateLimit(ipA), false);
      assert.strictEqual(checkRateLimit(ipB), true);
    });
  });

  describe('In-Memory Response Caching (getCached / setCached)', () => {
    it('stores and retrieves cache entries with TTL', () => {
      const key = 'test:query_hello';
      const val = { sample: 'result', time: Date.now() };
      setCached(key, val, 10_000);
      assert.deepStrictEqual(getCached(key), val);
    });

    it('invalidates expired cache entries', () => {
      const key = 'test:expired';
      setCached(key, { old: true }, -100);
      assert.strictEqual(getCached(key), null);
    });
  });

  describe('Gateway Router Contract Validation (handler)', () => {
    function createMockRes() {
      return {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(k, v) {
          this.headers[k.toLowerCase()] = v;
          return this;
        },
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(data) {
          this.body = data;
          return this;
        },
        end(data) {
          this.body = data;
          return this;
        }
      };
    }

    it('responds to OPTIONS pre-flight requests with 200 and CORS headers', async () => {
      const req = {
        method: 'OPTIONS',
        url: '/api/music',
        headers: { host: 'localhost:3000' }
      };
      const res = createMockRes();
      await handler(req, res);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['access-control-allow-origin'], '*');
    });

    it('handles empty search query gracefully with empty array payload', async () => {
      const req = {
        method: 'GET',
        url: '/api/music?action=search&q=',
        headers: { host: 'localhost:3000' }
      };
      const res = createMockRes();
      await handler(req, res);
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.body, { tracks: [], youtube: [] });
    });

    it('rejects untrusted proxy stream URLs with 403 Forbidden', async () => {
      const req = {
        method: 'GET',
        url: '/api/music?action=proxy-stream&url=http://127.0.0.1:8080/exploit',
        headers: { host: 'localhost:3000' }
      };
      const res = createMockRes();
      await handler(req, res);
      assert.strictEqual(res.statusCode, 403);
    });

    it('returns 400 for unknown actions', async () => {
      const req = {
        method: 'GET',
        url: '/api/music?action=unknown_invalid_action',
        headers: { host: 'localhost:3000' }
      };
      const res = createMockRes();
      await handler(req, res);
      assert.strictEqual(res.statusCode, 400);
    });
  });
});
