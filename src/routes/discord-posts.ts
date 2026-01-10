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
// POST /api/discord-posts/share
// POW 인증카드를 Discord에 공유 (Bot에게 전송 요청)
// (프론트엔드에서 호출)
// ============================================
const shareToDiscordSchema = z.object({
  discord_id: z.string(),
  session_id: z.string(),
  photo_url: z.string(),
  plan_text: z.string(),
  donation_mode: z.string(),
  duration_seconds: z.number().int().min(0),
  // 기부 정보
  donation_scope: z.string().optional(),
  donation_sats: z.number().int().optional(),
  total_donated_sats: z.number().int().optional(),
  total_accumulated_sats: z.number().int().optional(),
});

app.post('/share', async (c) => {
  try {
    const body = await c.req.json();
    const validated = shareToDiscordSchema.parse(body);
    const supabase = createSupabaseClient(c.env);

    // Discord 환경변수 확인
    const DISCORD_BOT_TOKEN = c.env.DISCORD_BOT_TOKEN;
    const POW_CHANNEL_ID = c.env.POW_CHANNEL_ID;

    if (!DISCORD_BOT_TOKEN || !POW_CHANNEL_ID) {
      return c.json({ error: 'Discord configuration missing' }, 500);
    }

    // discord_id로 user_id와 사용자 정보 조회
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, discord_username')
      .eq('discord_id', validated.discord_id)
      .single();

    if (userError || !user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // base64 이미지를 Buffer로 변환
    const base64Data = validated.photo_url.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    // 시간 포맷팅
    const minutes = Math.floor(validated.duration_seconds / 60);
    const seconds = validated.duration_seconds % 60;
    const timeText = seconds > 0 ? `${minutes}분 ${seconds}초` : `${minutes}분`;

    // 분야 이름 매핑
    const categoryNames: Record<string, string> = {
      'pow-writing': '글쓰기',
      'pow-reading': '독서',
      'pow-coding': '코딩',
      'pow-language': '어학',
      'pow-creative': '창작',
      'pow-fitness': '운동',
      'pow-meditation': '명상',
      'pow-music': '음악',
      'pow-art': '미술',
      'pow-other': '기타',
    };
    const categoryName = categoryNames[validated.donation_mode] || '공부';

    // BECA 총액 조회 (donations 테이블 합계)
    const { data: donationsData } = await supabase
      .from('donations')
      .select('amount_sats');

    const currentBECA = donationsData?.reduce((sum, d) => sum + (d.amount_sats || 0), 0) || 0;

    // 기부 모드에 따라 메시지 형식 변경
    const username = user.discord_username || '사용자';
    const donationScope = validated.donation_scope || 'total';
    const donationSats = validated.donation_sats || 0;
    const totalDonatedSats = validated.total_donated_sats || 0;
    const totalAccumulatedSats = validated.total_accumulated_sats || 0;

    let messageText = '';

    if (donationScope === 'session') {
      // 즉시 기부
      messageText = `**${username}**님께서 "${categoryName}"에서 POW 완료 후, ${donationSats}sats 기부 완료! 현재 Citadel POW BECA ${currentBECA + donationSats}sats!`;
    } else if (donationScope === 'total') {
      // 적립 후 기부
      messageText = `**${username}**님께서 "${categoryName}"에서 POW 완료 후, ${donationSats}sats 적립! 총 적립액 ${totalAccumulatedSats}sats!`;
    } else {
      // 적립액 기부 (daily, accumulated 등)
      messageText = `**${username}**님께서 적립해두셨던 ${donationSats}sats 기부 완료! 현재 Citadel POW BECA ${currentBECA + donationSats}sats!`;
    }

    messageText += `\n⏱️ ${timeText}\n📝 ${validated.plan_text}`;

    // FormData 생성 (Discord API 형식)
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: 'image/png' });
    formData.append('files[0]', blob, 'pow-card.png');

    const messageContent = {
      content: messageText,
      attachments: [{ id: 0, filename: 'pow-card.png' }],
    };
    formData.append('payload_json', JSON.stringify(messageContent));

    // Discord REST API로 메시지 전송
    const discordResponse = await fetch(`https://discord.com/api/v10/channels/${POW_CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
      },
      body: formData,
    });

    if (!discordResponse.ok) {
      const error = await discordResponse.text();
      console.error('Discord API 실패:', error);
      return c.json({ error: 'Failed to send message to Discord' }, 500);
    }

    const discordMessage = await discordResponse.json() as any;
    const messageId = discordMessage.id;

    console.log('✅ Discord 메시지 전송 성공:', messageId);

    // discord_posts 테이블에 저장
    const { data: discordPost, error: postError } = await supabase
      .from('discord_posts')
      .insert({
        message_id: messageId,
        channel_id: POW_CHANNEL_ID,
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

    if (postError) {
      console.error('discord_posts 저장 실패:', postError);
    } else {
      console.log('✅ discord_posts 저장 성공:', messageId);
    }

    // study_sessions에 discord_message_id 업데이트
    await supabase
      .from('study_sessions')
      .update({ discord_message_id: messageId })
      .eq('id', validated.session_id);

    return c.json({
      success: true,
      message_id: messageId,
      channel_id: POW_CHANNEL_ID,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request data', details: error.errors }, 400);
    }
    console.error('Exception in POST /share:', error);
    return c.json({ error: 'Failed to share to Discord' }, 500);
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
