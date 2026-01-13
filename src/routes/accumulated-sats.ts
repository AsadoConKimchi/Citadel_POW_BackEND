import { Hono } from 'hono';
import type { Env } from '../types';
import { createSupabaseClient } from '../supabase';
import { z } from 'zod';

const app = new Hono<{ Bindings: Env }>();

// ============================================
// GET /api/accumulated-sats/user/:discordId
// 사용자의 현재 적립액 조회
// ============================================
app.get('/user/:discordId', async (c) => {
  try {
    const discordId = c.req.param('discordId');
    const supabase = createSupabaseClient(c.env);

    // 1. Discord ID → User ID 조회
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('discord_id', discordId)
      .single();

    if (userError || !userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    // 2. 적립액 조회
    const { data, error } = await supabase
      .from('user_accumulated_sats')
      .select('accumulated_sats, last_updated')
      .eq('user_id', userData.id)
      .single();

    if (error) {
      // 레코드 없음 = 적립액 0
      if (error.code === 'PGRST116') {
        return c.json({
          success: true,
          data: {
            accumulated_sats: 0,
            last_updated: null,
          },
        });
      }
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data: {
        accumulated_sats: data.accumulated_sats,
        last_updated: data.last_updated,
      },
    });
  } catch (error) {
    console.error('Exception in GET /user/:discordId:', error);
    return c.json({ error: 'Failed to fetch accumulated sats' }, 500);
  }
});

// ============================================
// POST /api/accumulated-sats/add
// 적립액 추가 (디스코드 공유 성공 시)
// ============================================
const addSchema = z.object({
  discord_id: z.string(),
  amount: z.number().int().positive(),
  session_id: z.string().uuid().optional().nullable(),
  note: z.string().optional().nullable(),
});

app.post('/add', async (c) => {
  try {
    const body = await c.req.json();
    const validated = addSchema.parse(body);
    const supabase = createSupabaseClient(c.env);

    // 1. Discord ID → User ID 조회
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('discord_id', validated.discord_id)
      .single();

    if (userError || !userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    // 2. RPC 함수 호출 (트랜잭션 보장)
    const { data, error } = await supabase
      .rpc('add_accumulated_sats', {
        p_user_id: userData.id,
        p_amount: validated.amount,
        p_session_id: validated.session_id || null,
        p_note: validated.note || null,
      })
      .single();

    if (error) {
      console.error('RPC error:', error);
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data: {
        accumulated_sats: data.accumulated_sats,
        amount_before: data.amount_before,
        amount_after: data.amount_after,
        change_amount: validated.amount,
      },
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request body', details: error.errors }, 400);
    }
    console.error('Exception in POST /add:', error);
    return c.json({ error: 'Failed to add accumulated sats' }, 500);
  }
});

// ============================================
// POST /api/accumulated-sats/deduct
// 적립액 차감 (기부 완료 시)
// ============================================
const deductSchema = z.object({
  discord_id: z.string(),
  amount: z.number().int().positive(),
  donation_id: z.string().uuid().optional().nullable(),
  note: z.string().optional().nullable(),
});

app.post('/deduct', async (c) => {
  try {
    const body = await c.req.json();
    const validated = deductSchema.parse(body);
    const supabase = createSupabaseClient(c.env);

    // 1. Discord ID → User ID 조회
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('discord_id', validated.discord_id)
      .single();

    if (userError || !userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    // 2. RPC 함수 호출 (트랜잭션 보장 + 잔액 체크)
    const { data, error } = await supabase
      .rpc('deduct_accumulated_sats', {
        p_user_id: userData.id,
        p_amount: validated.amount,
        p_donation_id: validated.donation_id || null,
        p_note: validated.note || null,
      })
      .single();

    if (error) {
      // 적립액 부족 에러
      if (error.message.includes('Insufficient accumulated sats')) {
        return c.json({ error: error.message }, 400);
      }
      console.error('RPC error:', error);
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data: {
        accumulated_sats: data.accumulated_sats,
        amount_before: data.amount_before,
        amount_after: data.amount_after,
        change_amount: -validated.amount,
      },
    }, 200);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request body', details: error.errors }, 400);
    }
    console.error('Exception in POST /deduct:', error);
    return c.json({ error: 'Failed to deduct accumulated sats' }, 500);
  }
});

// ============================================
// GET /api/accumulated-sats/logs/:discordId
// 사용자의 적립/차감 이력 조회
// ============================================
app.get('/logs/:discordId', async (c) => {
  try {
    const discordId = c.req.param('discordId');
    const limit = c.req.query('limit') || '50';
    const offset = c.req.query('offset') || '0';
    const supabase = createSupabaseClient(c.env);

    // 1. Discord ID → User ID 조회
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('discord_id', discordId)
      .single();

    if (userError || !userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    // 2. 로그 조회
    const { data, error, count } = await supabase
      .from('accumulated_sats_logs')
      .select('*', { count: 'exact' })
      .eq('user_id', userData.id)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data: data || [],
      count: count || 0,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error('Exception in GET /logs/:discordId:', error);
    return c.json({ error: 'Failed to fetch logs' }, 500);
  }
});

// ============================================
// GET /api/accumulated-sats/validate
// 데이터 무결성 검증 (관리자용)
// ============================================
app.get('/validate', async (c) => {
  try {
    const supabase = createSupabaseClient(c.env);

    const { data, error } = await supabase.rpc('validate_accumulated_sats');

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    const invalid = data?.filter((row: any) => !row.is_valid) || [];

    return c.json({
      success: true,
      data: data || [],
      invalid_count: invalid.length,
      invalid_users: invalid,
    });
  } catch (error) {
    console.error('Exception in GET /validate:', error);
    return c.json({ error: 'Failed to validate data' }, 500);
  }
});

export default app;
