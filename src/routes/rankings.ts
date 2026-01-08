import { Hono } from 'hono';
import type { Env, LeaderboardEntry } from '../types';
import { createSupabaseClient } from '../supabase';
import { z } from 'zod';

const app = new Hono<{ Bindings: Env }>();

const querySchema = z.object({
  week: z.string().optional(),
  year: z.string().optional(),
  limit: z.string().default('100'),
});

app.get('/', async (c) => {
  try {
    const { week, year, limit } = querySchema.parse(c.req.query());
    const supabase = createSupabaseClient(c.env);

    let query = supabase
      .from('leaderboard')
      .select('*')
      .limit(parseInt(limit));

    if (week) {
      query = query.eq('week_number', parseInt(week));
    }
    if (year) {
      query = query.eq('year', parseInt(year));
    }

    const { data, error } = await query;

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data: data as LeaderboardEntry[],
      count: data?.length || 0,
    });
  } catch (error) {
    return c.json({ error: 'Invalid query parameters' }, 400);
  }
});

app.get('/current', async (c) => {
  try {
    const supabase = createSupabaseClient(c.env);
    const now = new Date();
    const currentWeek = getWeekNumber(now);
    const currentYear = now.getFullYear();

    const { data, error } = await supabase
      .from('leaderboard')
      .select('*')
      .eq('week_number', currentWeek)
      .eq('year', currentYear)
      .limit(100);

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      week: currentWeek,
      year: currentYear,
      data: data as LeaderboardEntry[],
      count: data?.length || 0,
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch current rankings' }, 500);
  }
});

app.get('/user/:discordId', async (c) => {
  try {
    const discordId = c.req.param('discordId');
    const supabase = createSupabaseClient(c.env);

    const { data, error } = await supabase
      .from('rankings')
      .select(`
        *,
        users:user_id (
          discord_username,
          discord_avatar
        )
      `)
      .eq('users.discord_id', discordId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data,
      count: data?.length || 0,
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch user rankings' }, 500);
  }
});

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export default app;
