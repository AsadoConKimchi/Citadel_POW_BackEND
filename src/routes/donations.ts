import { Hono } from 'hono';
import type { Env, TopDonor, Donation } from '../types';
import { createSupabaseClient } from '../supabase';
import { z } from 'zod';

const app = new Hono<{ Bindings: Env }>();

app.get('/top', async (c) => {
  try {
    const limit = c.req.query('limit') || '50';
    const supabase = createSupabaseClient(c.env);

    const { data, error } = await supabase
      .from('top_donors')
      .select('*')
      .limit(parseInt(limit));

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data: data as TopDonor[],
      count: data?.length || 0,
    });
  } catch (error) {
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
      .from('donations')
      .select('*')
      .eq('user_id', userData.id)
      .order('created_at', { ascending: false });

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
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch user donations' }, 500);
  }
});

const createDonationSchema = z.object({
  discord_id: z.string(),
  amount: z.number().int().positive(),
  currency: z.string().default('SAT'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // YYYY-MM-DD
  duration_seconds: z.number().int().min(0).optional(),
  duration_minutes: z.number().int().min(0).optional(),
  donation_mode: z.string().default('pow-writing'),
  donation_scope: z.string().default('session'),
  session_id: z.string().optional(),
  note: z.string().optional(),
  message: z.string().optional(), // deprecated
  transaction_id: z.string().optional(),
  status: z.enum(['pending', 'completed', 'failed']).default('pending'),
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
        date: validated.date || new Date().toISOString().split('T')[0],
        duration_seconds: validated.duration_seconds,
        duration_minutes: validated.duration_minutes,
        donation_mode: validated.donation_mode,
        donation_scope: validated.donation_scope,
        session_id: validated.session_id,
        note: validated.note || validated.message,
        message: validated.message,
        transaction_id: validated.transaction_id,
        status: validated.status,
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
    return c.json({ error: 'Failed to create donation' }, 500);
  }
});

export default app;
