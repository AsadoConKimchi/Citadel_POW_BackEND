import { Hono } from 'hono';
import type { Env, AccumulatedSats } from '../types';
import { createSupabaseClient } from '../supabase';
import { z } from 'zod';

const app = new Hono<{ Bindings: Env }>();

// 특정 날짜의 적립액 조회
app.get('/:discordId/:date', async (c) => {
  try {
    const discordId = c.req.param('discordId');
    const date = c.req.param('date');
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
      .from('accumulated_sats')
      .select('*')
      .eq('user_id', userData.id)
      .eq('date', date)
      .single();

    if (error) {
      // 데이터가 없는 경우 404가 아닌 빈 객체 반환
      if (error.code === 'PGRST116') {
        return c.json({
          success: true,
          data: null,
        });
      }
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data: data as AccumulatedSats,
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch accumulated sats' }, 500);
  }
});

// 적립액 생성/업데이트 (upsert)
const upsertAccumulatedSatsSchema = z.object({
  discord_id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  total_seconds: z.number().int().min(0),
  total_sats: z.number().int().min(0),
  plan_text: z.string().optional().nullable(),
  goal_minutes: z.number().int().min(0).optional().nullable(),
  donation_mode: z.string(),
  note: z.string().optional().nullable(),
});

app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const validated = upsertAccumulatedSatsSchema.parse(body);
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
      .from('accumulated_sats')
      .upsert({
        user_id: userData.id,
        date: validated.date,
        total_seconds: validated.total_seconds,
        total_sats: validated.total_sats,
        plan_text: validated.plan_text,
        goal_minutes: validated.goal_minutes,
        donation_mode: validated.donation_mode,
        note: validated.note,
      }, {
        onConflict: 'user_id,date',
      })
      .select()
      .single();

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data: data as AccumulatedSats,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request body', details: error.errors }, 400);
    }
    return c.json({ error: 'Failed to upsert accumulated sats' }, 500);
  }
});

// 적립액 삭제 (기부 완료 시)
app.delete('/:discordId/:date', async (c) => {
  try {
    const discordId = c.req.param('discordId');
    const date = c.req.param('date');
    const supabase = createSupabaseClient(c.env);

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('discord_id', discordId)
      .single();

    if (userError || !userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    const { error } = await supabase
      .from('accumulated_sats')
      .delete()
      .eq('user_id', userData.id)
      .eq('date', date);

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      message: 'Accumulated sats deleted successfully',
    });
  } catch (error) {
    return c.json({ error: 'Failed to delete accumulated sats' }, 500);
  }
});

// 사용자의 모든 적립액 조회 (선택적)
app.get('/:discordId', async (c) => {
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

    const { data, error } = await supabase
      .from('accumulated_sats')
      .select('*')
      .eq('user_id', userData.id)
      .order('date', { ascending: false });

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data: data as AccumulatedSats[],
      count: data?.length || 0,
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch accumulated sats' }, 500);
  }
});

export default app;
