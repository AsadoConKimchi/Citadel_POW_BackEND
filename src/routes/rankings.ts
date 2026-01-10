import { Hono } from 'hono';
import type { Env, LeaderboardEntry, RankingEntry } from '../types';
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

// ============================================
// GET /api/rankings/by-category
// 분야별 랭킹 조회 (POW 시간 또는 기부 금액 기준)
// ============================================
app.get('/by-category', async (c) => {
  try {
    const type = c.req.query('type') || 'time'; // 'time' | 'donation'
    const category = c.req.query('category') || 'all';
    const limit = c.req.query('limit') || '10';
    const supabase = createSupabaseClient(c.env);

    let rankings: RankingEntry[] = [];

    if (type === 'time') {
      // POW 시간 기준 랭킹
      let query = supabase
        .from('study_sessions')
        .select(`
          user_id,
          duration_seconds,
          duration_minutes,
          donation_mode,
          created_at,
          users:user_id (
            discord_id,
            discord_username,
            discord_avatar
          )
        `);

      if (category && category !== 'all') {
        query = query.eq('donation_mode', category);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching study sessions:', error);
        return c.json({ error: error.message }, 500);
      }

      // 사용자별 집계
      const userStats = new Map<string, {
        discord_id: string;
        discord_username: string;
        discord_avatar?: string;
        total_seconds: number;
        session_count: number;
        last_activity_at: string;
      }>();

      data?.forEach((session: any) => {
        const user = session.users;
        if (!user) return;

        // duration_seconds 우선 사용, 없으면 duration_minutes * 60
        const seconds = session.duration_seconds ?? (session.duration_minutes ? session.duration_minutes * 60 : 0);

        const existing = userStats.get(user.discord_id);
        if (existing) {
          existing.total_seconds += seconds;
          existing.session_count += 1;
          if (session.created_at > existing.last_activity_at) {
            existing.last_activity_at = session.created_at;
          }
        } else {
          userStats.set(user.discord_id, {
            discord_id: user.discord_id,
            discord_username: user.discord_username,
            discord_avatar: user.discord_avatar,
            total_seconds: seconds,
            session_count: 1,
            last_activity_at: session.created_at,
          });
        }
      });

      // 순위 계산 및 정렬
      rankings = Array.from(userStats.values())
        .sort((a, b) => b.total_seconds - a.total_seconds)
        .slice(0, parseInt(limit))
        .map((user, index) => ({
          rank: index + 1,
          discord_id: user.discord_id,
          discord_username: user.discord_username,
          discord_avatar: user.discord_avatar,
          total_seconds: user.total_seconds,
          total_minutes: Math.round(user.total_seconds / 60 * 10) / 10, // 소수점 1자리
          session_count: user.session_count,
          last_activity_at: user.last_activity_at,
        }));

    } else if (type === 'donation') {
      // 기부 금액 기준 랭킹
      let query = supabase
        .from('donations')
        .select(`
          user_id,
          amount,
          donation_mode,
          created_at,
          users:user_id (
            discord_id,
            discord_username,
            discord_avatar
          )
        `)
        .eq('status', 'completed');

      if (category && category !== 'all') {
        query = query.eq('donation_mode', category);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching donations:', error);
        return c.json({ error: error.message }, 500);
      }

      // 사용자별 집계
      const userStats = new Map<string, {
        discord_id: string;
        discord_username: string;
        discord_avatar?: string;
        total_donations: number;
        donation_count: number;
        last_activity_at: string;
      }>();

      data?.forEach((donation: any) => {
        const user = donation.users;
        if (!user) return;

        const existing = userStats.get(user.discord_id);
        if (existing) {
          existing.total_donations += donation.amount || 0;
          existing.donation_count += 1;
          if (donation.created_at > existing.last_activity_at) {
            existing.last_activity_at = donation.created_at;
          }
        } else {
          userStats.set(user.discord_id, {
            discord_id: user.discord_id,
            discord_username: user.discord_username,
            discord_avatar: user.discord_avatar,
            total_donations: donation.amount || 0,
            donation_count: 1,
            last_activity_at: donation.created_at,
          });
        }
      });

      // 순위 계산 및 정렬
      rankings = Array.from(userStats.values())
        .sort((a, b) => b.total_donations - a.total_donations)
        .slice(0, parseInt(limit))
        .map((user, index) => ({
          rank: index + 1,
          discord_id: user.discord_id,
          discord_username: user.discord_username,
          discord_avatar: user.discord_avatar,
          total_donations: user.total_donations,
          last_activity_at: user.last_activity_at,
        }));
    } else {
      return c.json({ error: 'Invalid type parameter. Use "time" or "donation"' }, 400);
    }

    return c.json({
      success: true,
      type,
      category,
      data: rankings,
      count: rankings.length,
    });
  } catch (error) {
    console.error('Exception in /by-category:', error);
    return c.json({ error: 'Failed to fetch rankings by category' }, 500);
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
