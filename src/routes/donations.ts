import { Hono } from 'hono';
import type { Env, TopDonor, Donation } from '../types';
import { createSupabaseClient } from '../supabase';
import { z } from 'zod';
import { invalidateRankingsCacheByCategory } from '../cache';

const app = new Hono<{ Bindings: Env }>();

app.get('/top', async (c) => {
  try {
    const limit = c.req.query('limit') || '50';
    const category = c.req.query('category'); // donation_mode 필터
    const supabase = createSupabaseClient(c.env);

    // 모든 기부 데이터 가져오기 (분야 필터링 포함)
    let query = supabase
      .from('donations')
      .select(`
        user_id,
        amount,
        created_at,
        users:user_id (
          discord_id,
          discord_username,
          discord_avatar
        )
      `)
      .eq('status', 'completed');

    // 분야별 필터링
    if (category && category !== 'all') {
      query = query.eq('donation_mode', category);
    }

    const { data: donations, error } = await query;

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    // 사용자별 집계 (user_id를 키로 사용)
    const userStats = new Map<string, {
      discord_id: string;
      discord_username: string;
      discord_avatar?: string;
      total_donated: number;
      donation_count: number;
      last_donation_at: string;
    }>();

    donations?.forEach((donation: any) => {
      const user = donation.users;
      if (!user) return;

      const key = donation.user_id; // user_id를 키로 사용 (더 정확)
      const existing = userStats.get(key);
      if (existing) {
        existing.total_donated += donation.amount || 0;
        existing.donation_count += 1;
        if (donation.created_at > existing.last_donation_at) {
          existing.last_donation_at = donation.created_at;
        }
      } else {
        userStats.set(key, {
          discord_id: user.discord_id,
          discord_username: user.discord_username,
          discord_avatar: user.discord_avatar,
          total_donated: donation.amount || 0,
          donation_count: 1,
          last_donation_at: donation.created_at,
        });
      }
    });

    const topDonors = Array.from(userStats.values())
      .sort((a, b) => b.total_donated - a.total_donated)
      .slice(0, parseInt(limit));

    return c.json({
      success: true,
      data: topDonors as TopDonor[],
      count: topDonors.length,
      category: category || 'all',
    });
  } catch (error) {
    console.error('Exception in /top:', error);
    return c.json({ error: 'Failed to fetch top donors' }, 500);
  }
});

app.get('/recent', async (c) => {
  try {
    const limit = c.req.query('limit') || '20';
    const supabase = createSupabaseClient(c.env);

    const { data, error } = await supabase
      .from('donations')
      .select(`
        *,
        users:user_id (
          discord_username,
          discord_avatar
        )
      `)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data,
      count: data?.length || 0,
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch recent donations' }, 500);
  }
});

app.get('/stats', async (c) => {
  try {
    const supabase = createSupabaseClient(c.env);

    const { data, error } = await supabase
      .rpc('get_donation_stats')
      .single();

    if (error) {
      const { data: donations } = await supabase
        .from('donations')
        .select('amount')
        .eq('status', 'completed');

      const total = donations?.reduce((sum, d) => sum + parseFloat(d.amount.toString()), 0) || 0;
      const count = donations?.length || 0;
      const average = count > 0 ? total / count : 0;

      return c.json({
        success: true,
        data: {
          total_amount: total,
          total_donations: count,
          average_donation: average,
        },
      });
    }

    return c.json({
      success: true,
      data,
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch donation stats' }, 500);
  }
});

app.get('/user/:discordId', async (c) => {
  try {
    const discordId = c.req.param('discordId');
    const month = c.req.query('month'); // YYYY-MM 형식
    const category = c.req.query('category'); // donation_mode 필터
    const supabase = createSupabaseClient(c.env);

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('discord_id', discordId)
      .single();

    if (userError || !userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    let query = supabase
      .from('donations')
      .select('*')
      .eq('user_id', userData.id);

    // 분야별 필터링
    if (category && category !== 'all') {
      query = query.eq('donation_mode', category);
    }

    // 월별 필터링
    if (month) {
      try {
        const [year, monthNum] = month.split('-');
        const startDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
        const endDate = new Date(parseInt(year), parseInt(monthNum), 0, 23, 59, 59, 999);

        query = query
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString());
      } catch (error) {
        return c.json({ error: 'Invalid month format. Use YYYY-MM' }, 400);
      }
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    const total = data?.reduce((sum, d) => sum + parseFloat(d.amount.toString()), 0) || 0;

    return c.json({
      success: true,
      user: {
        discord_id: discordId,
        total_donated: total,
        donation_count: data?.length || 0,
        donations: data,
      },
      filters: {
        month,
        category: category || 'all',
      },
    });
  } catch (error) {
    console.error('Exception in /user/:discordId:', error);
    return c.json({ error: 'Failed to fetch user donations' }, 500);
  }
});

const createDonationSchema = z.object({
  discord_id: z.string(),

  // 기부 정보
  amount: z.number().int().positive(),
  currency: z.string().default('SAT'),
  donation_mode: z.string().default('pow-writing'),
  donation_scope: z.string().default('session'),
  note: z.string().optional().nullable(),

  // POW 정보 (기부 시점 스냅샷)
  plan_text: z.string().optional().nullable(),
  duration_minutes: z.number().int().min(0).optional().nullable(),
  duration_seconds: z.number().int().min(0).optional().nullable(),
  goal_minutes: z.number().int().min(0).optional().nullable(),
  achievement_rate: z.number().min(0).max(200).optional().nullable(),
  photo_url: z.string().optional().nullable(),

  // 누적 정보 (기부 시점 스냅샷)
  accumulated_sats: z.number().int().min(0).optional().nullable(),
  total_accumulated_sats: z.number().int().min(0).optional().nullable(),
  total_donated_sats: z.number().int().min(0).optional().nullable(),

  // 결제 정보
  transaction_id: z.string().optional().nullable(),
  status: z.enum(['pending', 'completed', 'failed']).default('pending'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  session_id: z.string().optional().nullable(),

  // Deprecated
  message: z.string().optional().nullable(),
});

app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const validated = createDonationSchema.parse(body);
    const supabase = createSupabaseClient(c.env);

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('discord_id', validated.discord_id)
      .single();

    if (userError || !userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    const { data, error } = await supabase
      .from('donations')
      .insert({
        user_id: userData.id,
        amount: validated.amount,
        currency: validated.currency,
        donation_mode: validated.donation_mode,
        donation_scope: validated.donation_scope,
        note: validated.note || validated.message || null,
        plan_text: validated.plan_text,
        duration_minutes: validated.duration_minutes,
        duration_seconds: validated.duration_seconds,
        goal_minutes: validated.goal_minutes,
        achievement_rate: validated.achievement_rate,
        photo_url: validated.photo_url,
        accumulated_sats: validated.accumulated_sats,
        total_accumulated_sats: validated.total_accumulated_sats,
        total_donated_sats: validated.total_donated_sats,
        transaction_id: validated.transaction_id,
        status: validated.status,
        date: validated.date || new Date().toISOString().split('T')[0],
        session_id: validated.session_id,
        message: validated.message,
      })
      .select()
      .single();

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    // 랭킹 캐시 무효화 (해당 분야 + 전체)
    if (validated.donation_mode) {
      await invalidateRankingsCacheByCategory(c.env.CACHE, validated.donation_mode);
    }

    return c.json({
      success: true,
      data,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request body', details: error.errors }, 400);
    }
    return c.json({ error: 'Failed to create donation' }, 500);
  }
});

export default app;
