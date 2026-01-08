import { Hono } from 'hono';
import type { Env, StudySession, UserStudyStats } from '../types';
import { createSupabaseClient } from '../supabase';
import { z } from 'zod';

const app = new Hono<{ Bindings: Env }>();

// 특정 사용자의 공부 세션 조회
app.get('/user/:discordId', async (c) => {
  try {
    const discordId = c.req.param('discordId');
    const limit = c.req.query('limit') || '50';
    const supabase = createSupabaseClient(c.env);

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('discord_id', discordId)
      .single();

    if (userError || !userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    const { data, error } = await supabase
      .from('study_sessions')
      .select('*')
      .eq('user_id', userData.id)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data: data as StudySession[],
      count: data?.length || 0,
    });
  } catch (error) {
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
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  duration_minutes: z.number().int().positive(),
  plan_text: z.string().optional(),
  photo_url: z.string().url().optional(),
});

app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const validated = createStudySessionSchema.parse(body);
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

    // 공부 세션 생성
    const { data, error } = await supabase
      .from('study_sessions')
      .insert({
        user_id: userData.id,
        start_time: validated.start_time,
        end_time: validated.end_time,
        duration_minutes: validated.duration_minutes,
        plan_text: validated.plan_text,
        photo_url: validated.photo_url,
      })
      .select()
      .single();

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data: data as StudySession,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request body', details: error.errors }, 400);
    }
    return c.json({ error: 'Failed to create study session' }, 500);
  }
});

// 여러 공부 세션 일괄 생성 (프론트엔드의 localStorage 마이그레이션용)
const bulkCreateSchema = z.object({
  discord_id: z.string(),
  sessions: z.array(z.object({
    start_time: z.string().datetime(),
    end_time: z.string().datetime(),
    duration_minutes: z.number().int().positive(),
    plan_text: z.string().optional(),
    photo_url: z.string().url().optional(),
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
      start_time: session.start_time,
      end_time: session.end_time,
      duration_minutes: session.duration_minutes,
      plan_text: session.plan_text,
      photo_url: session.photo_url,
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
