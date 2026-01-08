import { Hono } from 'hono';
import type { Env } from './types';
import { corsMiddleware } from './middleware/cors';
import { loggerMiddleware } from './middleware/logger';

import rankingsRouter from './routes/rankings';
import donationsRouter from './routes/donations';
import discordRouter from './routes/discord';
import usersRouter from './routes/users';

const app = new Hono<{ Bindings: Env }>();

app.use('*', corsMiddleware);
app.use('*', loggerMiddleware);

app.get('/', (c) => {
  return c.json({
    name: 'Citadel POW Backend API',
    version: '1.0.0',
    status: 'operational',
    endpoints: {
      rankings: '/api/rankings',
      donations: '/api/donations',
      discord: '/api/discord',
      users: '/api/users',
    },
  });
});

app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

app.route('/api/rankings', rankingsRouter);
app.route('/api/donations', donationsRouter);
app.route('/api/discord', discordRouter);
app.route('/api/users', usersRouter);

app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

app.onError((err, c) => {
  console.error('Error:', err);
  return c.json(
    {
      error: 'Internal Server Error',
      message: err.message,
    },
    500
  );
});

export default app;
