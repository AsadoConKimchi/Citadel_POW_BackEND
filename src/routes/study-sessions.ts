import { Hono } from 'hono';
import type { Env, StudySession, UserStudyStats } from '../types';
import { createSupabaseClient } from '../supabase';
import { z } from 'zod';

const app = new Hono<{ Bindings: Env }>();

// 특정 사용자의 공부 세션 조회 (필터링 지원)
app.get('/user/:discordId', async (c) => {
  try {
    const discordId = c.req.param('discordId');
    const limit = c.req.query('limit') || '50';
    const category = c.req.query('category'); // donation_mode 필터
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
      .from('study_sessions')
      .select(`
        *,
        discord_posts(photo_url, reaction_count, message_id, channel_id)
      `)
      .eq('user_id', userData.id);

    // 분야별 필터링
    if (category && category !== 'all') {
      query = query.eq('donation_mode', category);
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

    return c.json({
      success: true,
      data: data as StudySession[],
      count: data?.length || 0,
      filters: {
        category: category || 'all',
        period,
        date,
      },
    });
  } catch (error) {
    console.error('Exception in /user/:discordId:', error);
    return c.json({ error: 'Failed to fetch user study sessions' }, 500);
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

// 오늘의 공부 세션 조회
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
      .from('study_sessions')
      .select('*')
      .eq('user_id', userData.id)
      .gte('created_at', today.toISOString())
      .lt('created_at', tomorrow.toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    const totalMinutes = data?.reduce((sum, session) => sum + session.duration_minutes, 0) || 0;

    return c.json({
      success: true,
      data: data as StudySession[],
      count: data?.length || 0,
      total_minutes: totalMinutes,
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch today study sessions' }, 500);
  }
});

// 공부 세션 생성
const createStudySessionSchema = z.object({
  discord_id: z.string(),

  // POW 정보
  donation_mode: z.string(),
  plan_text: z.string(),

  // 시간 정보
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  duration_minutes: z.number().int().min(0).optional(), // 백워드 호환성
  duration_seconds: z.number().int().min(0).optional(),
  goal_minutes: z.number().int().min(0),
  achievement_rate: z.number().min(0).max(200), // 달성률 0-200%

  // 인증카드
  photo_url: z.string().optional().nullable(),

  // 기부 연결
  donation_id: z.string().optional().nullable(),
});

app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    console.log('📥 Received study session request:', JSON.stringify(body));

    const validated = createStudySessionSchema.parse(body);
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

    // 공부 세션 생성
    const { data, error } = await supabase
      .from('study_sessions')
      .insert({
        user_id: userData.id,
        donation_mode: validated.donation_mode,
        plan_text: validated.plan_text,
        start_time: validated.start_time,
        end_time: validated.end_time,
        duration_seconds: durationSeconds,
        duration_minutes: durationMinutes,
        goal_minutes: validated.goal_minutes,
        achievement_rate: validated.achievement_rate,
        photo_url: validated.photo_url,
        donation_id: validated.donation_id,
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase insert error:', error);
      return c.json({ error: error.message }, 500);
    }

    console.log('✅ Study session created successfully');
    return c.json({
      success: true,
      data: data as StudySession,
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
    return c.json({ error: 'Failed to create study session' }, 500);
  }
});

// 여러 공부 세션 일괄 생성 (프론트엔드의 localStorage 마이그레이션용)
const bulkCreateSchema = z.object({
  discord_id: z.string(),
  sessions: z.array(z.object({
    donation_mode: z.string(),
    plan_text: z.string(),
    start_time: z.string().datetime(),
    end_time: z.string().datetime(),
    duration_minutes: z.number().int().min(0),
    goal_minutes: z.number().int().min(0),
    achievement_rate: z.number().min(0).max(200),
    photo_url: z.string().optional().nullable(),
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

    // 세션 데이터 준비
    const sessionsToInsert = validated.sessions.map(session => ({
      user_id: userData.id,
      donation_mode: session.donation_mode,
      plan_text: session.plan_text,
      start_time: session.start_time,
      end_time: session.end_time,
      duration_minutes: session.duration_minutes,
      goal_minutes: session.goal_minutes,
      achievement_rate: session.achievement_rate,
      photo_url: session.photo_url,
      donation_id: session.donation_id,
    }));

    // 일괄 삽입
    const { data, error } = await supabase
      .from('study_sessions')
      .insert(sessionsToInsert)
      .select();

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data: data as StudySession[],
      count: data?.length || 0,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request body', details: error.errors }, 400);
    }
    return c.json({ error: 'Failed to create study sessions' }, 500);
  }
});

export default app;
