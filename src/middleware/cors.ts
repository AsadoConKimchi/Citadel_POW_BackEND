import { cors } from 'hono/cors';

export const corsMiddleware = cors({
  origin: ['http://localhost:3000', 'https://citadel-pow.com', 'https://*.citadel-pow.com'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 600,
  credentials: true,
});
