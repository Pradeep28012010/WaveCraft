import handler, { type ApiRequest, type ApiResponse } from '../../api/music.js';

type EmitterListener = (...args: unknown[]) => void;

class SimpleEmitter {
  private listeners = new Map<string, Set<EmitterListener>>();

  on(event: string, listener: EmitterListener): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return this;
  }

  once(event: string, listener: EmitterListener): this {
    const wrapper: EmitterListener = (...args) => {
      this.removeListener(event, wrapper);
      listener(...args);
    };
    return this.on(event, wrapper);
  }

  removeListener(event: string, listener: EmitterListener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  off(event: string, listener: EmitterListener): this {
    return this.removeListener(event, listener);
  }

  emit(event: string, ...args: unknown[]): boolean {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return false;
    for (const fn of Array.from(set)) {
      fn(...args);
    }
    return true;
  }
}

function toBytes(data: unknown): Uint8Array | null {
  if (data === undefined || data === null) return null;
  if (data instanceof Uint8Array) return data;
  if (typeof data === 'string') return new TextEncoder().encode(data);
  return new TextEncoder().encode(JSON.stringify(data));
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const totalLen = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return merged;
}

export default async (req: Request): Promise<Response> => {
  let statusCode = 200;
  const headers = new Headers({
    'Access-Control-Allow-Origin': '*'
  });
  const bufferedChunks: Uint8Array[] = [];
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  let webStream: ReadableStream<Uint8Array> | null = null;
  let isStreaming = false;
  let hasEnded = false;

  let resolveHead: (() => void) | null = null;
  const headReady = new Promise<void>((resolve) => {
    resolveHead = resolve;
  });

  const reqHeaders: Record<string, string> = {};
  req.headers.forEach((val, key) => {
    reqHeaders[key.toLowerCase()] = val;
  });

  const clientIp =
    reqHeaders['x-nf-client-connection-ip'] ||
    reqHeaders['x-forwarded-for']?.split(',')[0]?.trim() ||
    'unknown';

  const parsedReqUrl = new URL(req.url);
  const mockReq: ApiRequest & SimpleEmitter = Object.assign(new SimpleEmitter(), {
    method: req.method,
    url: `${parsedReqUrl.pathname}${parsedReqUrl.search}`,
    headers: reqHeaders,
    socket: { remoteAddress: clientIp },
    body: req.method === 'POST' ? await req.text() : undefined,
    destroy(): void {
      mockReq.emit('close');
    }
  });

  const ensureStreamingStarted = () => {
    if (isStreaming || hasEnded) return;
    isStreaming = true;
    mockRes.headersSent = true;
    webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        while (bufferedChunks.length > 0) {
          const next = bufferedChunks.shift();
          if (next) controller.enqueue(next);
        }
        if (hasEnded) {
          try {
            controller.close();
          } catch {}
        }
      },
      cancel() {
        hasEnded = true;
        streamController = null;
        mockReq.emit('close');
        mockRes.emit('close');
      }
    });
    resolveHead?.();
    resolveHead = null;
  };

  if (req.signal) {
    req.signal.addEventListener(
      'abort',
      () => {
        mockReq.emit('close');
      },
      { once: true }
    );
  }

  const mockRes: ApiResponse & SimpleEmitter & {
    writable: boolean;
    write: (chunk: unknown, encodingOrCb?: unknown, cb?: unknown) => boolean;
    end: (data?: unknown, encodingOrCb?: unknown, cb?: unknown) => ApiResponse;
    destroy: (err?: Error) => ApiResponse;
  } = Object.assign(new SimpleEmitter(), {
    writable: true,
    headersSent: false,
    writableEnded: false,
    get statusCode(): number {
      return statusCode;
    },
    set statusCode(code: number) {
      statusCode = code;
    },
    setHeader(k: string, v: string | number | readonly string[]): ApiResponse {
      if (Array.isArray(v)) {
        headers.set(k, v.join(', '));
      } else {
        headers.set(k, String(v));
      }
      return mockRes;
    },
    getHeader(k: string): string | undefined {
      return headers.get(k) ?? undefined;
    },
    flushHeaders(): ApiResponse {
      ensureStreamingStarted();
      return mockRes;
    },
    status(code: number): ApiResponse {
      statusCode = code;
      return mockRes;
    },
    json(data: unknown): ApiResponse {
      headers.set('Content-Type', 'application/json');
      return mockRes.end(JSON.stringify(data));
    },
    send(data: unknown): ApiResponse {
      if (typeof data !== 'string' && !(data instanceof Uint8Array)) {
        if (!headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/json');
        }
        return mockRes.end(JSON.stringify(data));
      }
      return mockRes.end(data);
    },
    write(chunk: unknown, encodingOrCb?: unknown, cb?: unknown): boolean {
      const bytes = toBytes(chunk);
      if (bytes && bytes.byteLength > 0) {
        if (streamController && !hasEnded) {
          streamController.enqueue(bytes);
        } else {
          bufferedChunks.push(bytes);
        }
      }
      const callback = typeof encodingOrCb === 'function' ? encodingOrCb : typeof cb === 'function' ? cb : null;
      if (callback) (callback as () => void)();
      return true;
    },
    end(data?: unknown, encodingOrCb?: unknown, cb?: unknown): ApiResponse {
      if (!hasEnded) {
        if (data !== undefined && data !== null && typeof data !== 'function') {
          mockRes.write(data);
        }
        hasEnded = true;
        mockRes.headersSent = true;
        mockRes.writableEnded = true;
        if (streamController) {
          try {
            streamController.close();
          } catch {}
        }
        mockRes.emit('finish');
        mockRes.emit('close');
        resolveHead?.();
        resolveHead = null;
      }
      const callback =
        typeof data === 'function'
          ? data
          : typeof encodingOrCb === 'function'
          ? encodingOrCb
          : typeof cb === 'function'
          ? cb
          : null;
      if (callback) (callback as () => void)();
      return mockRes;
    },
    destroy(err?: Error): ApiResponse {
      if (!hasEnded) {
        hasEnded = true;
        mockRes.writableEnded = true;
        if (streamController) {
          try {
            if (err) {
              streamController.error(err);
            } else {
              streamController.close();
            }
          } catch {}
        }
        if (err) mockRes.emit('error', err);
        mockRes.emit('close');
        resolveHead?.();
        resolveHead = null;
      }
      return mockRes;
    }
  });

  // Automatically promote to streaming when Node Readable.pipe(mockRes) attaches
  mockRes.on('pipe', () => {
    ensureStreamingStarted();
  });

  const handlerPromise = (async () => {
    try {
      await handler(mockReq, mockRes);
      if (!isStreaming && !hasEnded) {
        mockRes.end();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Server error';
      if (!mockRes.headersSent && !isStreaming && !hasEnded) {
        statusCode = 500;
        headers.set('Content-Type', 'application/json');
        mockRes.end(JSON.stringify({ error: msg }));
      } else {
        mockRes.destroy(err instanceof Error ? err : new Error(msg));
      }
    }
  })();

  await headReady;
  if (!isStreaming) {
    await handlerPromise;
  }

  if (req.method === 'HEAD') {
    return new Response(null, { status: statusCode, headers });
  }

  if (isStreaming && webStream) {
    return new Response(webStream, { status: statusCode, headers });
  }

  const baseBody = bufferedChunks.length > 0 ? concatChunks(bufferedChunks) : '';
  const finalBody: BodyInit =
    typeof baseBody !== 'string' && baseBody.byteLength === 0
      ? headers.get('Content-Type')?.includes('json')
        ? '{}'
        : ''
      : (baseBody as unknown as BodyInit);

  return new Response(finalBody, {
    status: statusCode,
    headers
  });
};

export const config = {
  path: '/api/music'
};
