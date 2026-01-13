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
// Optimized: RPC 함수 사용 + KV 캐싱 (5분 TTL)
// ============================================
app.get('/by-category', async (c) => {
  try {
    const type = c.req.query('type') || 'time'; // 'time' | 'donation'
    const category = c.req.query('category') || 'all';
    const limit = c.req.query('limit') || '10';

    // 캐시 키 생성
    const cacheKey = `rankings:${type}:${category}:${limit}`;

    // 1. 캐시 조회 시도
    const cached = await c.env.CACHE.get(cacheKey, 'json');
    if (cached) {
      console.log(`Cache HIT: ${cacheKey}`);
      return c.json({
        success: true,
        type,
        category,
        data: cached,
        count: (cached as any[]).length,
        cached: true, // 캐시에서 반환되었음을 표시
      });
    }

    console.log(`Cache MISS: ${cacheKey}`);

    // 2. 캐시 미스 - DB 조회
    const supabase = createSupabaseClient(c.env);
    let rankings: RankingEntry[] = [];

    if (type === 'time') {
      // POW 시간 기준 랭킹 - RPC 함수 호출
      const { data, error } = await supabase.rpc('get_pow_time_rankings', {
        p_category: category,
        p_limit: parseInt(limit),
      });

      if (error) {
        console.error('Error fetching POW time rankings:', error);
        return c.json({ error: error.message }, 500);
      }

      rankings = data || [];

    } else if (type === 'donation') {
      // 기부 금액 기준 랭킹 - RPC 함수 호출
      const { data, error } = await supabase.rpc('get_donation_rankings', {
        p_category: category,
        p_limit: parseInt(limit),
      });

      if (error) {
        console.error('Error fetching donation rankings:', error);
        return c.json({ error: error.message }, 500);
      }

      rankings = data || [];

    } else {
      return c.json({ error: 'Invalid type parameter. Use "time" or "donation"' }, 400);
    }

    // 3. 캐시에 저장 (TTL: 5분)
    await c.env.CACHE.put(cacheKey, JSON.stringify(rankings), {
      expirationTtl: 300, // 5분
    });

    return c.json({
      success: true,
      type,
      category,
      data: rankings,
      count: rankings.length,
      cached: false, // DB에서 직접 조회되었음을 표시
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
