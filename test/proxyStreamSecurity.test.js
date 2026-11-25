import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import handler from '../api/music.js';
import {
  isAllowedAudioProxyUrl,
  checkRateLimit,
  ipRequestCounts,
  MAX_REQUESTS_PER_WINDOW,
  RATE_LIMIT_WINDOW_MS
} from '../api/lib/cache.js';

function createMockRes() {
  const res = {
    statusCode: 200,
    headersSent: false,
    headers: {},
    body: null,
    chunks: [],
    listeners: new Map(),
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
      return this;
    },
    getHeader(k) {
      return this.headers[k.toLowerCase()];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.headers['content-type'] = 'application/json';
      this.body = data;
      this.headersSent = true;
      return this;
    },
    send(data) {
      this.body = data;
      this.headersSent = true;
      return this;
    },
    write(chunk) {
      this.chunks.push(chunk);
      return true;
    },
    end(data) {
      if (data !== undefined) this.body = data;
      this.headersSent = true;
      return this;
    },
    on(ev, fn) {
      if (!this.listeners.has(ev)) this.listeners.set(ev, new Set());
      this.listeners.get(ev).add(fn);
      return this;
    }
  };
  return res;
}

describe('Proxy Stream Security, Rate Limiting & Netlify Adapter Tests', () => {
  it('blocks cleartext http, non-443 ports, credentials, and bare apex HTML domains in isAllowedAudioProxyUrl', () => {
    assert.equal(isAllowedAudioProxyUrl('http://c.saavncdn.com/song.mp4'), false);
    assert.equal(isAllowedAudioProxyUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), false);
    assert.equal(isAllowedAudioProxyUrl('https://apple.com/legal'), false);
    assert.equal(isAllowedAudioProxyUrl('https://saavn.com/login'), false);
    assert.equal(isAllowedAudioProxyUrl('https://user:pass@c.saavncdn.com/song.mp4'), false);
    assert.equal(isAllowedAudioProxyUrl('https://c.saavncdn.com:8443/song.mp4'), false);
    assert.equal(isAllowedAudioProxyUrl('https://172.16.0.1/internal'), false);
    assert.equal(isAllowedAudioProxyUrl('https://0.0.0.0/admin'), false);
    assert.equal(isAllowedAudioProxyUrl('https://c.saavncdn.com/999/Sample-Song.mp4'), true);
    assert.equal(isAllowedAudioProxyUrl('https://rr1---sn-4g5ednss.googlevideo.com/videoplayback'), true);
  });

  it('enforces rate limit bucket on missing/unknown IP instead of bypassing unconditionally', () => {
    ipRequestCounts.delete('unknown');
    ipRequestCounts.set('unknown', {
      count: MAX_REQUESTS_PER_WINDOW,
      resetAt: Date.now() + RATE_LIMIT_WINDOW_MS
    });
    assert.equal(checkRateLimit('unknown'), false);
    assert.equal(checkRateLimit(''), false);
    ipRequestCounts.delete('unknown');
  });

  it('rejects HTML/SVG XSS upstream responses with 415 and enforces nosniff + attachment headers on proxy-stream', async () => {
    const origFetch = globalThis.fetch;
    try {
      // 1. Upstream returns text/html (potential stored XSS if proxied inline)
      globalThis.fetch = async () =>
        new Response('<html><script>alert(1)</script></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' }
        });

      const xssReq = {
        method: 'GET',
        url: '/api/music?action=proxy-stream&url=' + encodeURIComponent('https://c.saavncdn.com/evil.html'),
        headers: { host: 'localhost:3000', 'x-forwarded-for': '198.51.100.77' }
      };
      const xssRes = createMockRes();
      await handler(xssReq, xssRes);
      assert.equal(xssRes.statusCode, 415);

      // 2. Upstream returns audio/mpeg -> allowed with attachment + nosniff
      globalThis.fetch = async () =>
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { 'content-type': 'audio/mpeg', 'content-length': '4' }
        });

      const okReq = {
        method: 'HEAD',
        url: '/api/music?action=proxy-stream&url=' + encodeURIComponent('https://c.saavncdn.com/good.mp3'),
        headers: { host: 'localhost:3000', 'x-forwarded-for': '198.51.100.78' }
      };
      const okRes = createMockRes();
      await handler(okReq, okRes);
      assert.equal(okRes.statusCode, 200);
      assert.equal(okRes.headers['x-content-type-options'], 'nosniff');
      assert.equal(okRes.headers['content-disposition'], 'attachment; filename="stream.m4a"');
      assert.equal(okRes.headers['content-type'], 'audio/mpeg');

      // 3. GET stream with application/octet-stream coerces to audio/mp4 and pipes bytes cleanly
      const { PassThrough } = await import('node:stream');
      globalThis.fetch = async () =>
        new Response(new Uint8Array([65, 66, 67]), {
          status: 200,
          headers: { 'content-type': 'application/octet-stream', 'content-length': '3' }
        });

      const streamSink = new PassThrough();
      const collected = [];
      streamSink.on('data', (chunk) => collected.push(chunk));
      const pipedHeaders = {};
      const pipedRes = Object.assign(streamSink, {
        statusCode: 200,
        headersSent: false,
        setHeader(k, v) {
          pipedHeaders[k.toLowerCase()] = v;
          return pipedRes;
        },
        status(code) {
          pipedRes.statusCode = code;
          return pipedRes;
        },
        json(data) {
          pipedRes.headersSent = true;
          streamSink.end(JSON.stringify(data));
          return pipedRes;
        },
        send(data) {
          pipedRes.headersSent = true;
          streamSink.end(data);
          return pipedRes;
        }
      });

      const doneStreaming = new Promise((resolve) => streamSink.on('finish', resolve));
      const streamReq = {
        method: 'GET',
        url: '/api/music?action=proxy-stream&url=' + encodeURIComponent('https://c.saavncdn.com/stream.mp4'),
        headers: { host: 'localhost:3000', 'x-forwarded-for': '198.51.100.82' }
      };
      await handler(streamReq, pipedRes);
      await doneStreaming;
      assert.equal(pipedRes.statusCode, 200);
      assert.equal(pipedHeaders['content-type'], 'audio/mp4');
      assert.equal(pipedHeaders['content-disposition'], 'attachment; filename="stream.m4a"');
      assert.deepEqual(Buffer.concat(collected), Buffer.from([65, 66, 67]));
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('blocks excessive upstream redirect loops on proxy-stream and validates redirect targets', async () => {
    const origFetch = globalThis.fetch;
    let calls = 0;
    try {
      globalThis.fetch = async () => {
        calls++;
        return new Response(null, {
          status: 302,
          headers: { location: `https://c.saavncdn.com/hop-${calls}.mp4` }
        });
      };
      const req = {
        method: 'GET',
        url: '/api/music?action=proxy-stream&url=' + encodeURIComponent('https://c.saavncdn.com/start.mp4'),
        headers: { host: 'localhost:3000', 'x-forwarded-for': '198.51.100.79' }
      };
      const res = createMockRes();
      await handler(req, res);
      assert.equal(res.statusCode, 502);
      assert.ok(calls <= 6);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('handles malformed req.url gracefully with 400 and avoids PII in feedback logs', async () => {
    const reqBad = {
      method: 'GET',
      url: 'http://[::1',
      headers: { host: 'invalid host name', 'x-forwarded-for': '198.51.100.80' }
    };
    const resBad = createMockRes();
    await handler(reqBad, resBad);
    assert.equal(resBad.statusCode, 400);

    const origLog = console.log;
    const logged = [];
    console.log = (...args) => logged.push(args.join(' '));
    try {
      const fbReq = {
        method: 'POST',
        url: '/api/music?action=feedback',
        headers: { host: 'localhost:3000', 'x-forwarded-for': '198.51.100.81' },
        body: JSON.stringify({
          type: 'bug',
          title: 'Audio hiccup',
          email: 'private-user@example.com'
        })
      };
      const fbRes = createMockRes();
      await handler(fbReq, fbRes);
      assert.equal(fbRes.statusCode, 200);
      assert.equal(fbRes.body.success, true);
      assert.equal(logged.some((l) => l.includes('private-user@example.com') || l.includes('198.51.100.81')), false);
    } finally {
      console.log = origLog;
    }
  });

  it('verifies Netlify adapter preserves write chunks, setHeader binding, and streams SSE without throwing', async () => {
    const mtsPath = path.resolve(process.cwd(), 'netlify/functions/music.mts');
    const source = fs.readFileSync(mtsPath, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText;

    const moduleObj = { exports: {} };
    const customRequire = (id) => {
      if (id === '../../api/music.js') {
        return {
          __esModule: true,
          default: async (_mockReq, mockRes) => {
            // Confirm setHeader returns mockRes cleanly (would throw with arrow `this`)
            const chained = mockRes.setHeader('X-Custom-Adapter', 'ok').status(200);
            assert.equal(chained, mockRes);
            mockRes.write('hello-');
            mockRes.end('world');
          }
        };
      }
      throw new Error(`Unexpected require in music.mts test: ${id}`);
    };
    new Function('require', 'exports', 'module', transpiled)(customRequire, moduleObj.exports, moduleObj);
    const netlifyHandler = moduleObj.exports.default;

    const response = await netlifyHandler(new Request('https://wavecraft.netlify.app/api/music?action=test'));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-custom-adapter'), 'ok');
    assert.equal(await response.text(), 'hello-world');

    // Verify SSE streaming opens live ReadableStream via flushHeaders() and propagates cancel -> req close
    let closedOnReq = false;
    const sseModule = { exports: {} };
    const sseRequire = (id) => {
      if (id === '../../api/music.js') {
        return {
          __esModule: true,
          default: (mockReq, mockRes) => {
            mockReq.on?.('close', () => {
              closedOnReq = true;
            });
            mockRes.setHeader('Content-Type', 'text/event-stream');
            mockRes.flushHeaders();
            mockRes.write(': connected\n\n');
            setTimeout(() => {
              mockRes.write('data: {"ok":true}\n\n');
              mockRes.end();
            }, 15);
          }
        };
      }
      throw new Error(`Unexpected require: ${id}`);
    };
    new Function('require', 'exports', 'module', transpiled)(sseRequire, sseModule.exports, sseModule);
    const sseResponse = await sseModule.exports.default(new Request('https://wavecraft.netlify.app/api/music?action=jam&op=stream'));
    assert.equal(sseResponse.status, 200);
    assert.equal(sseResponse.headers.get('content-type'), 'text/event-stream');
    assert.equal(await sseResponse.text(), ': connected\n\ndata: {"ok":true}\n\n');
    assert.equal(closedOnReq, false);
  });
});
