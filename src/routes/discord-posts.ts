import { Hono } from 'hono';
import type { Env, DiscordPost, PopularPost } from '../types';
import { createSupabaseClient } from '../supabase';
import { z } from 'zod';

const app = new Hono<{ Bindings: Env }>();

// ============================================
// GET /api/discord-posts/popular
// 인기 게시물 조회 (Discord 반응 수 기준)
// ============================================
app.get('/popular', async (c) => {
  try {
    const category = c.req.query('category') || 'all';
    const limit = c.req.query('limit') || '20';
    const supabase = createSupabaseClient(c.env);

    let query = supabase
      .from('popular_posts')
      .select('*')
      .order('reaction_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    // 분야별 필터링
    if (category && category !== 'all') {
      query = query.eq('donation_mode', category);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching popular posts:', error);
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data: data as PopularPost[],
      count: data?.length || 0,
    });
  } catch (error) {
    console.error('Exception in /popular:', error);
    return c.json({ error: 'Failed to fetch popular posts' }, 500);
  }
});

// ============================================
// GET /api/discord-posts/:messageId
// 특정 Discord 메시지 조회
// ============================================
app.get('/:messageId', async (c) => {
  try {
    const messageId = c.req.param('messageId');
    const supabase = createSupabaseClient(c.env);

    const { data, error } = await supabase
      .from('discord_posts')
      .select(`
        *,
        users:user_id (
          discord_username,
          discord_avatar
        )
      `)
      .eq('message_id', messageId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return c.json({ error: 'Post not found' }, 404);
      }
      console.error('Error fetching discord post:', error);
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data: data,
    });
  } catch (error) {
    console.error('Exception in /:messageId:', error);
    return c.json({ error: 'Failed to fetch discord post' }, 500);
  }
});

// ============================================
// POST /api/discord-posts
// 새 Discord 게시물 등록
// (Discord 봇에서 메시지 생성 시 호출)
// ============================================
const createDiscordPostSchema = z.object({
  message_id: z.string(),
  channel_id: z.string(),
  discord_id: z.string(),
  session_id: z.string().optional().nullable(),
  photo_url: z.string().optional().nullable(),
  plan_text: z.string().optional().nullable(),
  donation_mode: z.string().optional().nullable(),
});

app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const validated = createDiscordPostSchema.parse(body);
    const supabase = createSupabaseClient(c.env);

    // discord_id로 user_id 조회
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('discord_id', validated.discord_id)
      .single();

    if (userError || !user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Discord 게시물 삽입
    const { data, error } = await supabase
      .from('discord_posts')
      .insert({
        message_id: validated.message_id,
        channel_id: validated.channel_id,
        user_id: user.id,
        session_id: validated.session_id,
        photo_url: validated.photo_url,
        plan_text: validated.plan_text,
        donation_mode: validated.donation_mode,
        reaction_count: 0,
        reactions: {},
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating discord post:', error);
      return c.json({ error: error.message }, 500);
    }

    // study_sessions에 discord_message_id 업데이트 (session_id가 있는 경우)
    if (validated.session_id) {
      await supabase
        .from('study_sessions')
        .update({ discord_message_id: validated.message_id })
        .eq('id', validated.session_id);
    }

    return c.json({
      success: true,
      data: data as DiscordPost,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request data', details: error.errors }, 400);
    }
    console.error('Exception in POST /:', error);
    return c.json({ error: 'Failed to create discord post' }, 500);
  }
});

// ============================================
// PUT /api/discord-posts/reactions
// Discord 반응 수 업데이트
// (Discord 봇에서 반응 변경 시 호출)
// ============================================
const updateReactionsSchema = z.object({
  message_id: z.string(),
  reaction_count: z.number().int().min(0),
  reactions: z.record(z.number()).optional(), // { "👍": 5, "❤️": 3 }
});

app.put('/reactions', async (c) => {
  try {
    const body = await c.req.json();
    const validated = updateReactionsSchema.parse(body);
    const supabase = createSupabaseClient(c.env);

    // Discord 게시물 업데이트
    const updateData: any = {
      reaction_count: validated.reaction_count,
      updated_at: new Date().toISOString(),
    };

    if (validated.reactions) {
      updateData.reactions = validated.reactions;
    }

    const { data, error } = await supabase
      .from('discord_posts')
      .update(updateData)
      .eq('message_id', validated.message_id)
      .select()
      .single();

    if (error) {
      console.error('Error updating reactions:', error);
      return c.json({ error: error.message }, 500);
    }

    // study_sessions에도 reaction_count 업데이트
    if (data) {
      await supabase
        .from('study_sessions')
        .update({ reaction_count: validated.reaction_count })
        .eq('discord_message_id', validated.message_id);
    }

    return c.json({
      success: true,
      data: data as DiscordPost,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request data', details: error.errors }, 400);
    }
    console.error('Exception in PUT /reactions:', error);
    return c.json({ error: 'Failed to update reactions' }, 500);
  }
});

// ============================================
// DELETE /api/discord-posts/:messageId
// Discord 게시물 삭제
// (필요 시 사용, Discord 메시지 삭제 시)
// ============================================
app.delete('/:messageId', async (c) => {
  try {
    const messageId = c.req.param('messageId');
    const supabase = createSupabaseClient(c.env);

    const { error } = await supabase
      .from('discord_posts')
      .delete()
      .eq('message_id', messageId);

    if (error) {
      console.error('Error deleting discord post:', error);
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      message: 'Discord post deleted successfully',
    });
  } catch (error) {
    console.error('Exception in DELETE /:messageId:', error);
    return c.json({ error: 'Failed to delete discord post' }, 500);
  }
});

export default app;
