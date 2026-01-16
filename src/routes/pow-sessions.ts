import { Hono } from 'hono';
import type { Env, PowSession, UserStudyStats } from '../types';
import { createSupabaseClient } from '../supabase';
import { z } from 'zod';
import { invalidateRankingsCacheByCategory } from '../cache';

const app = new Hono<{ Bindings: Env }>();

// 특정 사용자의 POW 세션 조회 (필터링 지원)
app.get('/user/:discordId', async (c) => {
  try {
    const discordId = c.req.param('discordId');
    const limit = c.req.query('limit') || '50';
    const category = c.req.query('category'); // pow_fields 필터
    const period = c.req.query('period'); // 'today' | 'week' | 'month'
    const date = c.req.query('date'); // YYYY-MM-DD 형식
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
      .from('pow_sessions')
      .select(`
        *,
        discord_posts(photo_url, reaction_count, message_id, channel_id)
      `)
      .eq('user_id', userData.id);

    // 분야별 필터링
    if (category && category !== 'all') {
      query = query.eq('pow_fields', category);
    }

    // 기간별 필터링
    if (period) {
      const now = new Date();
      let startDate: Date;
      let endDate: Date = new Date(now);
      endDate.setHours(23, 59, 59, 999);

      if (period === 'today') {
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
      } else if (period === 'week') {
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
      } else if (period === 'month') {
        startDate = new Date(now);
        startDate.setDate(1); // 이번 달 1일
        startDate.setHours(0, 0, 0, 0);
      } else {
        return c.json({ error: 'Invalid period. Use "today", "week", or "month"' }, 400);
      }

      query = query
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
    }

    // 특정 날짜 필터링
    if (date) {
      try {
        const targetDate = new Date(date);
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        query = query
          .gte('created_at', startOfDay.toISOString())
          .lte('created_at', endOfDay.toISOString());
      } catch (error) {
        return c.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, 400);
      }
    }

    query = query
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    const { data, error } = await query;

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    // Algorithm v3: 런타임 achievement_rate 계산 추가
    const dataWithAchievementRate = data?.map(session => ({
      ...session,
      achievement_rate: session.goal_seconds > 0
        ? Math.floor((session.duration_seconds || session.duration_minutes * 60) / session.goal_seconds * 100)
        : (session.goal_minutes > 0
          ? Math.floor((session.duration_minutes / session.goal_minutes) * 100)
          : 100),
    }));

    return c.json({
      success: true,
      data: dataWithAchievementRate as PowSession[],
      count: dataWithAchievementRate?.length || 0,
      filters: {
        category: category || 'all',
        period,
        date,
      },
    });
  } catch (error) {
    console.error('Exception in /user/:discordId:', error);
    return c.json({ error: 'Failed to fetch user pow sessions' }, 500);
  }
});

// 사용자의 공부 통계 조회
app.get('/stats/:discordId', async (c) => {
  try {
    const discordId = c.req.param('discordId');
    const supabase = createSupabaseClient(c.env);

    const { data, error } = await supabase
      .from('user_study_stats')
      .select('*')
      .eq('discord_id', discordId)
      .single();

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data: data as UserStudyStats,
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch user study stats' }, 500);
  }
});

// 오늘의 POW 세션 조회
app.get('/today/:discordId', async (c) => {
  try {
    const discordId = c.req.param('discordId');
    const supabase = createSupabaseClient(c.env);

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('discord_id', discordId)
      .single();

    if (userError || !userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data, error } = await supabase
      .from('pow_sessions')
      .select('*')
      .eq('user_id', userData.id)
      .gte('created_at', today.toISOString())
      .lt('created_at', tomorrow.toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    const totalMinutes = data?.reduce((sum, session) => sum + session.duration_minutes, 0) || 0;
    const totalSeconds = data?.reduce((sum, session) => sum + (session.duration_seconds || session.duration_minutes * 60), 0) || 0;

    // Algorithm v3: 런타임 achievement_rate 계산 추가
    const dataWithAchievementRate = data?.map(session => ({
      ...session,
      achievement_rate: session.goal_seconds > 0
        ? Math.floor((session.duration_seconds || session.duration_minutes * 60) / session.goal_seconds * 100)
        : (session.goal_minutes > 0
          ? Math.floor((session.duration_minutes / session.goal_minutes) * 100)
          : 100),
    }));

    return c.json({
      success: true,
      data: dataWithAchievementRate as PowSession[],
      count: dataWithAchievementRate?.length || 0,
      total_minutes: totalMinutes,
      total_seconds: totalSeconds,
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch today pow sessions' }, 500);
  }
});

// ============================================
// POW 세션 생성 (Algorithm v3)
// - achievement_rate: 저장 안함 (런타임 계산)
// - donation_id: 저장 안함 (donations.session_id로 단방향 참조)
// - goal_seconds: 새로 추가
// ============================================
const createPowSessionSchema = z.object({
  discord_id: z.string(),

  // POW 정보
  pow_fields: z.string(),
  pow_plan_text: z.string(),

  // 시간 정보
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  duration_minutes: z.number().int().min(0).optional(), // 백워드 호환성 (deprecated)
  duration_seconds: z.number().int().min(0).optional(),
  goal_minutes: z.number().int().min(0).optional(), // 백워드 호환성 (deprecated)
  goal_seconds: z.number().int().min(0).optional(),

  // 인증카드
  photo_url: z.string().optional().nullable(),

  // Deprecated (하위 호환성)
  achievement_rate: z.number().min(0).max(200).optional(), // 저장하지 않음
  donation_id: z.string().optional().nullable(), // 저장하지 않음
  // 하위 호환성 alias
  donation_mode: z.string().optional(), // pow_fields로 매핑
  plan_text: z.string().optional(), // pow_plan_text로 매핑
});

app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    console.log('📥 Received pow session request:', JSON.stringify(body));

    const validated = createPowSessionSchema.parse(body);
    console.log('✅ Validation passed');

    const supabase = createSupabaseClient(c.env);

    // 사용자 조회
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('discord_id', validated.discord_id)
      .single();

    if (userError || !userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    // duration_seconds 우선 사용, 없으면 duration_minutes 사용
    const durationSeconds = validated.duration_seconds ?? (validated.duration_minutes ? validated.duration_minutes * 60 : 0);
    const durationMinutes = Math.round(durationSeconds / 60);

    // goal_seconds 우선 사용, 없으면 goal_minutes 사용
    const goalSeconds = validated.goal_seconds ?? (validated.goal_minutes ? validated.goal_minutes * 60 : 0);
    const goalMinutes = Math.round(goalSeconds / 60);

    // 하위 호환성: donation_mode → pow_fields, plan_text → pow_plan_text
    const powFields = validated.pow_fields || validated.donation_mode || 'pow-writing';
    const powPlanText = validated.pow_plan_text || validated.plan_text || '';

    // Algorithm v3: POW 세션 생성 (achievement_rate, donation_id 저장 안함)
    const { data, error } = await supabase
      .from('pow_sessions')
      .insert({
        user_id: userData.id,
        pow_fields: powFields,
        pow_plan_text: powPlanText,
        start_time: validated.start_time,
        end_time: validated.end_time,
        duration_seconds: durationSeconds,
        duration_minutes: durationMinutes,
        goal_seconds: goalSeconds,
        goal_minutes: goalMinutes,
        photo_url: validated.photo_url,
        // achievement_rate: 저장 안함 (런타임 계산)
        // donation_id: 저장 안함 (donations.session_id로 단방향 참조)
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase insert error:', error);
      return c.json({ error: error.message }, 500);
    }

    // 런타임 achievement_rate 계산
    const achievementRate = goalSeconds > 0
      ? Math.floor((durationSeconds / goalSeconds) * 100)
      : 100; // 목표 없음 = 100%

    console.log('✅ POW session created successfully');

    // 랭킹 캐시 무효화 (해당 분야 + 전체)
    await invalidateRankingsCacheByCategory(c.env.CACHE, powFields);

    return c.json({
      success: true,
      data: {
        ...data,
        achievement_rate: achievementRate, // 런타임 계산값 포함
      } as PowSession,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Zod validation error:', JSON.stringify(error.errors));
      return c.json({
        error: 'Invalid request body',
        details: error.errors,
        message: 'Validation failed. Check the details field for more information.'
      }, 400);
    }
    console.error('❌ Unexpected error:', error);
    return c.json({ error: 'Failed to create pow session' }, 500);
  }
});

// ============================================
// 여러 POW 세션 일괄 생성 (프론트엔드의 localStorage 마이그레이션용)
// Algorithm v3: achievement_rate, donation_id 저장 안함
// ============================================
const bulkCreateSchema = z.object({
  discord_id: z.string(),
  sessions: z.array(z.object({
    pow_fields: z.string().optional(),
    pow_plan_text: z.string().optional(),
    start_time: z.string().datetime(),
    end_time: z.string().datetime(),
    duration_minutes: z.number().int().min(0).optional(),
    duration_seconds: z.number().int().min(0).optional(),
    goal_minutes: z.number().int().min(0).optional(),
    goal_seconds: z.number().int().min(0).optional(),
    photo_url: z.string().optional().nullable(),
    // Deprecated (하위 호환성)
    donation_mode: z.string().optional(),
    plan_text: z.string().optional(),
    achievement_rate: z.number().min(0).max(200).optional(),
    donation_id: z.string().optional().nullable(),
  })),
});

app.post('/bulk', async (c) => {
  try {
    const body = await c.req.json();
    const validated = bulkCreateSchema.parse(body);
    const supabase = createSupabaseClient(c.env);

    // 사용자 조회
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('discord_id', validated.discord_id)
      .single();

    if (userError || !userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    // 세션 데이터 준비 (achievement_rate, donation_id 저장 안함)
    const sessionsToInsert = validated.sessions.map(session => {
      const durationSeconds = session.duration_seconds ?? (session.duration_minutes ? session.duration_minutes * 60 : 0);
      const goalSeconds = session.goal_seconds ?? (session.goal_minutes ? session.goal_minutes * 60 : 0);

      return {
        user_id: userData.id,
        pow_fields: session.pow_fields || session.donation_mode || 'pow-writing',
        pow_plan_text: session.pow_plan_text || session.plan_text || '',
        start_time: session.start_time,
        end_time: session.end_time,
        duration_seconds: durationSeconds,
        duration_minutes: Math.round(durationSeconds / 60),
        goal_seconds: goalSeconds,
        goal_minutes: Math.round(goalSeconds / 60),
        photo_url: session.photo_url,
      };
    });

    // 일괄 삽입
    const { data, error } = await supabase
      .from('pow_sessions')
      .insert(sessionsToInsert)
      .select();

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    // 런타임 achievement_rate 계산 추가
    const dataWithAchievementRate = data?.map(session => ({
      ...session,
      achievement_rate: session.goal_seconds > 0
        ? Math.floor((session.duration_seconds / session.goal_seconds) * 100)
        : 100,
    }));

    return c.json({
      success: true,
      data: dataWithAchievementRate as PowSession[],
      count: dataWithAchievementRate?.length || 0,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request body', details: error.errors }, 400);
    }
    return c.json({ error: 'Failed to create pow sessions' }, 500);
  }
});

// ============================================
// 헬퍼 함수: 세션 데이터에 런타임 achievement_rate 추가
// ============================================
function addAchievementRate(sessions: any[]) {
  return sessions.map(session => ({
    ...session,
    achievement_rate: session.goal_seconds > 0
      ? Math.floor((session.duration_seconds || session.duration_minutes * 60) / session.goal_seconds * 100)
      : (session.goal_minutes > 0
        ? Math.floor((session.duration_minutes / session.goal_minutes) * 100)
        : 100),
  }));
}

export default app;
