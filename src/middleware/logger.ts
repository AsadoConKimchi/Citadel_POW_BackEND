import { MiddlewareHandler } from 'hono';

export const loggerMiddleware: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;

  console.log(`${c.req.method} ${c.req.url} - ${c.res.status} - ${ms}ms`);
};
