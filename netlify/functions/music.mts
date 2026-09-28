import handler from '../../api/music.js';

export default async (req: Request) => {
  let statusCode = 200;
  let responseData: any = null;
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  const mockReq = {
    method: req.method,
    url: req.url,
    headers: { host: 'localhost' }
  };

  const mockRes = {
    setHeader: (k: string, v: string) => { headers[k] = v; },
    status(code: number) { statusCode = code; return this; },
    json(data: any) { responseData = data; return this; },
    end() { return this; }
  };

  await handler(mockReq, mockRes);
  return new Response(JSON.stringify(responseData || {}), {
    status: statusCode,
    headers
  });
};

export const config = {
  path: '/api/music'
};
