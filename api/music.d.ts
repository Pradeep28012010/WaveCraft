export interface ApiRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
  body?: unknown;
  on?: (event: string, listener: (...args: unknown[]) => void) => unknown;
  destroy?: () => unknown;
}

export interface ApiResponse {
  statusCode: number;
  headersSent?: boolean;
  writableEnded?: boolean;
  setHeader: (name: string, value: string | number | readonly string[]) => unknown;
  getHeader?: (name: string) => unknown;
  flushHeaders?: () => unknown;
  status: (code: number) => ApiResponse;
  json: (data: unknown) => unknown;
  send: (data: unknown) => unknown;
  write?: (chunk: unknown) => boolean;
  end: (data?: unknown) => unknown;
  on?: (event: string, listener: (...args: unknown[]) => void) => unknown;
  destroy?: (error?: Error) => unknown;
}

export default function handler(req: ApiRequest, res: ApiResponse): Promise<unknown>;
