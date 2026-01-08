import { Hono } from 'hono';
import type { Env, TopPost } from '../types';
import { createSupabaseClient } from '../supabase';
import { z } from 'zod';

const app = new Hono<{ Bindings: Env }>();

app.get('/top-posts', async (c) => {
  try {
    const limit = c.req.query('limit') || '20';
    const supabase = createSupabaseClient(c.env);

    const { data, error } = await supabase
      .from('top_discord_posts')
      .select('*')
      .limit(parseInt(limit));

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data: data as TopPost[],
      count: data?.length || 0,
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch top posts' }, 500);
  }
});

app.get('/posts/recent', async (c) => {
  try {
    const limit = c.req.query('limit') || '50';
    const supabase = createSupabaseClient(c.env);

    const { data, error } = await supabase
      .from('discord_posts')
      .select(`
        *,
        users:user_id (
          discord_username,
          discord_avatar
        ),
        post_reactions (
          reaction_count,
          comment_count,
          total_engagement
        )
      `)
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
    return c.json({ error: 'Failed to fetch recent posts' }, 500);
  }
});

app.get('/posts/user/:discordId', async (c) => {
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
      .from('discord_posts')
      .select(`
        *,
        post_reactions (
          reaction_count,
          comment_count,
          total_engagement
        )
      `)
      .eq('user_id', userData.id)
      .order('created_at', { ascending: false });

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data,
      count: data?.length || 0,
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch user posts' }, 500);
  }
});

const createPostSchema = z.object({
  discord_id: z.string(),
  discord_message_id: z.string(),
  channel_id: z.string(),
  content: z.string(),
});

app.post('/posts', async (c) => {
  try {
    const body = await c.req.json();
    const validated = createPostSchema.parse(body);
    const supabase = createSupabaseClient(c.env);

    const { data: userData, error: userError } = await supabase
      .from('users')
      .upsert({
        discord_id: validated.discord_id,
        discord_username: validated.discord_id,
      }, {
        onConflict: 'discord_id',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (userError || !userData) {
      return c.json({ error: 'Failed to create/fetch user' }, 500);
    }

    const { data, error } = await supabase
      .from('discord_posts')
      .insert({
        user_id: userData.id,
        discord_message_id: validated.discord_message_id,
        channel_id: validated.channel_id,
        content: validated.content,
      })
      .select()
      .single();

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    await supabase
      .from('post_reactions')
      .insert({
        post_id: data.id,
        reaction_count: 0,
        comment_count: 0,
      });

    return c.json({
      success: true,
      data,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request body', details: error.errors }, 400);
    }
    return c.json({ error: 'Failed to create post' }, 500);
  }
});

const updateReactionsSchema = z.object({
  discord_message_id: z.string(),
  reaction_count: z.number().min(0),
  comment_count: z.number().min(0),
});

app.patch('/reactions', async (c) => {
  try {
    const body = await c.req.json();
    const validated = updateReactionsSchema.parse(body);
    const supabase = createSupabaseClient(c.env);

    const { data: postData, error: postError } = await supabase
      .from('discord_posts')
      .select('id')
      .eq('discord_message_id', validated.discord_message_id)
      .single();

    if (postError || !postData) {
      return c.json({ error: 'Post not found' }, 404);
    }

    const { data, error } = await supabase
      .from('post_reactions')
      .update({
        reaction_count: validated.reaction_count,
        comment_count: validated.comment_count,
      })
      .eq('post_id', postData.id)
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
    return c.json({ error: 'Failed to update reactions' }, 500);
  }
});

export default app;
