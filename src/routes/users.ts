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

    const [rankingResult, donationResult, postResult] = await Promise.all([
      supabase
        .from('rankings')
        .select('pow_score, rank')
        .eq('user_id', userData.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),

      supabase
        .from('donations')
        .select('amount')
        .eq('user_id', userData.id)
        .eq('status', 'completed'),

      supabase
        .from('discord_posts')
        .select('id, post_reactions(total_engagement)')
        .eq('user_id', userData.id),
    ]);

    const totalDonated = donationResult.data?.reduce(
      (sum, d) => sum + parseFloat(d.amount.toString()),
      0
    ) || 0;

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
        total_donated: totalDonated,
        donation_count: donationResult.data?.length || 0,
        post_count: postResult.data?.length || 0,
        total_engagement: totalEngagement,
      },
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch user stats' }, 500);
  }
});

export default app;
