import { Hono } from 'hono';
import type { Env } from '../types';
import { createSupabaseClient } from '../supabase';
import { z } from 'zod';

const app = new Hono<{ Bindings: Env }>();

app.get('/:discordId', async (c) => {
  try {
    const discordId = c.req.param('discordId');
    const supabase = createSupabaseClient(c.env);

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('discord_id', discordId)
      .single();

    if (error) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({
      success: true,
      data,
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch user' }, 500);
  }
});

const createUserSchema = z.object({
  discord_id: z.string(),
  discord_username: z.string(),
  discord_avatar: z.string().optional(),
});

app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const validated = createUserSchema.parse(body);
    const supabase = createSupabaseClient(c.env);

    const { data, error } = await supabase
      .from('users')
      .upsert(validated, {
        onConflict: 'discord_id',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request body', details: error.errors }, 400);
    }
    return c.json({ error: 'Failed to create/update user' }, 500);
  }
});

// ============================================
// PATCH /api/users/:discordId/settings
// 사용자 설정 업데이트 (donation_scope 등)
// ============================================
const updateSettingsSchema = z.object({
  donation_scope: z.enum(['session', 'total']).optional(),
});

app.patch('/:discordId/settings', async (c) => {
  try {
    const discordId = c.req.param('discordId');
    const body = await c.req.json();
    const validated = updateSettingsSchema.parse(body);
    const supabase = createSupabaseClient(c.env);

    // Discord ID로 사용자 조회
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('discord_id', discordId)
      .single();

    if (userError || !userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    // 설정 업데이트
    const { data, error } = await supabase
      .from('users')
      .update(validated)
      .eq('discord_id', discordId)
      .select()
      .single();

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request body', details: error.errors }, 400);
    }
    return c.json({ error: 'Failed to update settings' }, 500);
  }
});

// ============================================
// GET /api/users/:discordId/stats
// 사용자 통계 조회
// Algorithm v3: user_total_donated 테이블 사용 (효율적인 인덱스 조회)
// ============================================
app.get('/:discordId/stats', async (c) => {
  try {
    const discordId = c.req.param('discordId');
    const supabase = createSupabaseClient(c.env);

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, discord_username, discord_avatar')
      .eq('discord_id', discordId)
      .single();

    if (userError || !userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    const [rankingResult, totalDonatedResult, postResult] = await Promise.all([
      supabase
        .from('rankings')
        .select('pow_score, rank')
        .eq('user_id', userData.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),

      // Algorithm v3: user_total_donated 테이블에서 조회 (트리거로 자동 업데이트됨)
      supabase
        .from('user_total_donated')
        .select('total_donated, donation_count, last_donated_at')
        .eq('user_id', userData.id)
        .single(),

      supabase
        .from('discord_posts')
        .select('id, post_reactions(total_engagement)')
        .eq('user_id', userData.id),
    ]);

    // user_total_donated 테이블에서 값 가져오기 (없으면 0)
    const totalDonatedSats = totalDonatedResult.data?.total_donated || 0;
    const donationCount = totalDonatedResult.data?.donation_count || 0;

    const totalEngagement = postResult.data?.reduce(
      (sum, p: any) => sum + (p.post_reactions?.[0]?.total_engagement || 0),
      0
    ) || 0;

    return c.json({
      success: true,
      data: {
        user: userData,
        current_rank: rankingResult.data?.rank || null,
        current_score: rankingResult.data?.pow_score || 0,
        // Algorithm v3: 프론트엔드와 키 이름 통일
        total_donated_sats: totalDonatedSats,
        total_donated: totalDonatedSats,  // 하위호환성 유지
        donation_count: donationCount,
        post_count: postResult.data?.length || 0,
        total_engagement: totalEngagement,
      },
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch user stats' }, 500);
  }
});

export default app;
