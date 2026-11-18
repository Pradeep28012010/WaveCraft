import handler from '../../api/music.js';

export default async (req: Request) => {
  let statusCode = 200;
  let responseBody: any = null;
  const chunks: Uint8Array[] = [];
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*'
  };

  const reqHeaders: Record<string, string> = {};
  req.headers.forEach((val, key) => {
    reqHeaders[key.toLowerCase()] = val;
  });

  const mockReq = {
    method: req.method,
    url: req.url,
    headers: reqHeaders,
    body: req.method === 'POST' ? await req.text() : undefined
  };

  const mockRes = {
    setHeader: (k: string, v: string) => {
      headers[k] = v;
      return this;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      headers['Content-Type'] = 'application/json';
      responseBody = JSON.stringify(data);
      return this;
    },
    send(data: any) {
      if (Buffer.isBuffer(data)) {
        responseBody = data;
      } else if (typeof data === 'string') {
        responseBody = data;
      } else {
        headers['Content-Type'] = 'application/json';
        responseBody = JSON.stringify(data);
      }
      return this;
    },
    write(chunk: any) {
      if (chunk) {
        if (typeof chunk === 'string') {
          chunks.push(new TextEncoder().encode(chunk));
        } else if (chunk instanceof Uint8Array || Buffer.isBuffer(chunk)) {
          chunks.push(chunk);
        }
      }
      return true;
    },
    end(data?: any) {
      if (data) {
        mockRes.send(data);
      }
      return this;
    }
  };

  try {
    await handler(mockReq, mockRes);
  } catch (err: any) {
    statusCode = 500;
    responseBody = JSON.stringify({ error: err?.message || 'Server error' });
    headers['Content-Type'] = 'application/json';
  }

  let finalBody: BodyInit | null = responseBody;
  if (!finalBody && chunks.length > 0) {
    const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
    const merged = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    finalBody = merged;
  }

  if (finalBody === null) {
    finalBody = headers['Content-Type']?.includes('json') ? '{}' : '';
  }

  return new Response(finalBody, {
    status: statusCode,
    headers
  });
};

export const config = {
  path: '/api/music'
};
