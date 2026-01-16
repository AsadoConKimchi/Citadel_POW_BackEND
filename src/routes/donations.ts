import { Hono } from 'hono';
import type { Env, TopDonor, Donation } from '../types';
import { createSupabaseClient } from '../supabase';
import { z } from 'zod';
import { invalidateRankingsCacheByCategory } from '../cache';

const app = new Hono<{ Bindings: Env }>();

app.get('/top', async (c) => {
  try {
    const limit = c.req.query('limit') || '50';
    const category = c.req.query('category'); // pow_fields 필터
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
      query = query.eq('pow_fields', category);
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
    const category = c.req.query('category'); // pow_fields 필터
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
      query = query.eq('pow_fields', category);
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

// ============================================
// Algorithm v3: 간소화된 기부 스키마
// - achievement_rate, total_donated_sats, total_accumulated_sats: 저장 안함 (런타임 계산)
// - duration_*, goal_*: 저장 안함 (pow_sessions에서 참조)
// - 3단계 status: pending → paid → completed
// ============================================
const createDonationSchema = z.object({
  discord_id: z.string(),

  // 기부 정보
  amount: z.number().int().positive(),
  currency: z.string().default('SAT'),
  pow_fields: z.string().default('pow-writing'),
  donation_mode: z.string().default('session'), // 'session' | 'total'
  note: z.string().optional().nullable(),

  // POW 정보 (간소화 - 참조용)
  pow_plan_text: z.string().optional().nullable(),
  photo_url: z.string().optional().nullable(),

  // 하위 호환성 alias
  donation_scope: z.string().optional(), // → donation_mode
  plan_text: z.string().optional().nullable(), // → pow_plan_text

  // 누적 정보 (기부 시점 스냅샷 - 표시용)
  accumulated_sats: z.number().int().min(0).optional().nullable(),

  // 결제 정보
  transaction_id: z.string().optional().nullable(),
  status: z.enum(['pending', 'paid', 'completed', 'failed', 'cancelled']).default('pending'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  session_id: z.string().uuid().optional().nullable(), // pow_sessions FK

  // Deprecated (하위 호환성)
  message: z.string().optional().nullable(),
  donationMode: z.string().optional(), // → pow_fields (camelCase alias)
  donationScope: z.string().optional(), // → donation_mode (camelCase alias)
  planText: z.string().optional().nullable(), // → pow_plan_text (camelCase alias)
  duration_minutes: z.number().int().min(0).optional().nullable(),
  duration_seconds: z.number().int().min(0).optional().nullable(),
  goal_minutes: z.number().int().min(0).optional().nullable(),
  achievement_rate: z.number().min(0).max(200).optional().nullable(),
  total_accumulated_sats: z.number().int().min(0).optional().nullable(),
  total_donated_sats: z.number().int().min(0).optional().nullable(),
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

    // 하위 호환성 매핑
    const powFields = validated.pow_fields || validated.donationMode || 'pow-writing';
    const donationMode = validated.donation_mode || validated.donationScope || validated.donation_scope || 'session';
    const powPlanText = validated.pow_plan_text || validated.planText || validated.plan_text || null;

    // Algorithm v3: 간소화된 insert
    // - achievement_rate, total_donated_sats, total_accumulated_sats: 저장 안함
    // - paid_at: status가 'paid'인 경우 현재 시간
    const insertData: Record<string, any> = {
      user_id: userData.id,
      amount: validated.amount,
      currency: validated.currency,
      pow_fields: powFields,
      donation_mode: donationMode,
      note: validated.note || validated.message || null,
      pow_plan_text: powPlanText,
      photo_url: validated.photo_url,
      accumulated_sats: validated.accumulated_sats,
      transaction_id: validated.transaction_id,
      status: validated.status,
      date: validated.date || new Date().toISOString().split('T')[0],
      session_id: validated.session_id,
      // discord_shared: 생성 시점에는 false (Discord 공유 후 true로 변경)
      discord_shared: false,
    };

    // status가 'paid'인 경우 paid_at 설정
    if (validated.status === 'paid') {
      insertData.paid_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('donations')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    // 랭킹 캐시 무효화 (해당 분야 + 전체)
    if (powFields) {
      await invalidateRankingsCacheByCategory(c.env.CACHE, powFields);
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

// ============================================
// PATCH /api/donations/:donationId/status
// 기부 상태 업데이트 (3단계 흐름)
// pending → paid (결제 성공 시)
// paid → completed (Discord 공유 성공 시)
// ============================================
const updateStatusSchema = z.object({
  status: z.enum(['pending', 'paid', 'completed', 'failed', 'cancelled']),
  transaction_id: z.string().optional().nullable(),
  discord_shared: z.boolean().optional(),
});

app.patch('/:donationId/status', async (c) => {
  try {
    const donationId = c.req.param('donationId');
    const body = await c.req.json();
    const validated = updateStatusSchema.parse(body);
    const supabase = createSupabaseClient(c.env);

    // 1. 현재 기부 상태 조회
    const { data: currentDonation, error: fetchError } = await supabase
      .from('donations')
      .select('status, paid_at')
      .eq('id', donationId)
      .single();

    if (fetchError || !currentDonation) {
      return c.json({ error: 'Donation not found' }, 404);
    }

    // 2. 상태 전이 검증
    const currentStatus = currentDonation.status;
    const newStatus = validated.status;

    // 유효한 상태 전이만 허용
    const validTransitions: Record<string, string[]> = {
      pending: ['paid', 'failed', 'cancelled'],
      paid: ['completed', 'failed', 'cancelled'],
      completed: [], // 완료 후 변경 불가
      failed: ['pending'], // 재시도 가능
      cancelled: [], // 취소 후 변경 불가
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      return c.json({
        error: `Invalid status transition: ${currentStatus} → ${newStatus}`,
        code: 'INVALID_TRANSITION',
      }, 400);
    }

    // 3. 업데이트 데이터 구성
    const updateData: Record<string, any> = {
      status: newStatus,
    };

    // pending → paid: paid_at 설정
    if (currentStatus === 'pending' && newStatus === 'paid') {
      updateData.paid_at = new Date().toISOString();
      if (validated.transaction_id) {
        updateData.transaction_id = validated.transaction_id;
      }
    }

    // paid → completed: discord_shared 설정
    if (currentStatus === 'paid' && newStatus === 'completed') {
      updateData.discord_shared = validated.discord_shared ?? true;
    }

    // 4. 업데이트 실행
    const { data, error } = await supabase
      .from('donations')
      .update(updateData)
      .eq('id', donationId)
      .select()
      .single();

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data,
      transition: {
        from: currentStatus,
        to: newStatus,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request body', details: error.errors }, 400);
    }
    console.error('Exception in PATCH /:donationId/status:', error);
    return c.json({ error: 'Failed to update donation status' }, 500);
  }
});

// ============================================
// GET /api/donations/:donationId
// 단일 기부 조회
// ============================================
app.get('/:donationId', async (c) => {
  try {
    const donationId = c.req.param('donationId');
    const supabase = createSupabaseClient(c.env);

    const { data, error } = await supabase
      .from('donations')
      .select(`
        *,
        users:user_id (
          discord_id,
          discord_username,
          discord_avatar
        )
      `)
      .eq('id', donationId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return c.json({ error: 'Donation not found' }, 404);
      }
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Exception in GET /:donationId:', error);
    return c.json({ error: 'Failed to fetch donation' }, 500);
  }
});

export default app;
