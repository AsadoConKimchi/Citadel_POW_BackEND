import { Hono } from 'hono';
import type { Env, GroupMeetup, MeetupWithStats, MeetupDetails, PendingMeetupDonation } from '../types';
import { createSupabaseClient } from '../supabase';
import { z } from 'zod';

const app = new Hono<{ Bindings: Env }>();

// ============================================
// Helper Functions
// ============================================

/**
 * Generate HMAC-SHA256 using Web Crypto API
 */
async function generateHMAC(message: string, secretKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretKey);
  const messageData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

/**
 * Generate QR code data with HMAC-SHA256 checksum
 * Format: meetup:{meetup_id}:{timestamp}:{checksum}
 */
async function generateQRData(meetupId: string, secretKey: string): Promise<{ qrData: string; expiresAt: Date }> {
  const timestamp = Math.floor(Date.now() / 1000);
  const expiresAt = new Date((timestamp + 3600) * 1000); // 1 hour from now

  // Create HMAC checksum
  const message = `${meetupId}:${timestamp}`;
  const fullChecksum = await generateHMAC(message, secretKey);
  const checksum = fullChecksum.slice(0, 8);

  const qrData = `meetup:${meetupId}:${timestamp}:${checksum}`;

  return { qrData, expiresAt };
}

/**
 * Verify QR code data
 */
async function verifyQRData(qrData: string, secretKey: string): Promise<{ valid: boolean; meetupId?: string; error?: string }> {
  const parts = qrData.split(':');

  if (parts.length !== 4 || parts[0] !== 'meetup') {
    return { valid: false, error: 'Invalid QR format' };
  }

  const [_, meetupId, timestampStr, providedChecksum] = parts;
  const timestamp = parseInt(timestampStr);

  // Check expiration (1 hour)
  const now = Math.floor(Date.now() / 1000);
  if (now - timestamp > 3600) {
    return { valid: false, error: 'QR code expired' };
  }

  // Verify checksum
  const message = `${meetupId}:${timestamp}`;
  const fullChecksum = await generateHMAC(message, secretKey);
  const expectedChecksum = fullChecksum.slice(0, 8);

  if (expectedChecksum !== providedChecksum) {
    return { valid: false, error: 'Invalid QR checksum' };
  }

  return { valid: true, meetupId };
}

/**
 * Check if user has Organizer role
 */
function hasOrganizerRole(discordId: string, env: Env): boolean {
  const allowedIds = env.ORGANIZER_DISCORD_IDS || '';
  const idList = allowedIds.split(',').map(id => id.trim()).filter(id => id.length > 0);

  if (idList.length === 0) {
    // If no IDs configured, allow all users (development mode)
    console.warn('ORGANIZER_DISCORD_IDS not configured - allowing all users');
    return true;
  }

  return idList.includes(discordId);
}

/**
 * Check if user is the organizer of a meetup
 */
async function isOrganizer(supabase: any, meetupId: string, discordId: string): Promise<boolean> {
  const { data: meetup, error } = await supabase
    .from('group_meetups')
    .select(`
      organizer_id,
      users:organizer_id (discord_id)
    `)
    .eq('id', meetupId)
    .single();

  if (error || !meetup) {
    return false;
  }

  return meetup.users.discord_id === discordId;
}

// ============================================
// 1. POST /api/meetups - Create Meet-up (Organizer only)
// ============================================

const createMeetupSchema = z.object({
  discord_id: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  image_url: z.string().url().optional(),
  donation_mode: z.string().default('pow-writing'),
  scheduled_at: z.string().datetime(),
  duration_minutes: z.number().int().positive(),
  target_donation_amount: z.number().int().positive(),
});

app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const validated = createMeetupSchema.parse(body);
    const supabase = createSupabaseClient(c.env);

    // Get user ID
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('discord_id', validated.discord_id)
      .single();

    if (userError || !userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Check if user has Organizer role
    if (!hasOrganizerRole(validated.discord_id, c.env)) {
      return c.json({
        success: false,
        error: 'Only Organizers can create meet-ups'
      }, 403);
    }

    // Create meetup
    const { data, error } = await supabase
      .from('group_meetups')
      .insert({
        organizer_id: userData.id,
        title: validated.title,
        description: validated.description,
        image_url: validated.image_url,
        donation_mode: validated.donation_mode,
        scheduled_at: validated.scheduled_at,
        duration_minutes: validated.duration_minutes,
        target_donation_amount: validated.target_donation_amount,
        status: 'scheduled',
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
    console.error('Exception in POST /meetups:', error);
    return c.json({ error: 'Failed to create meetup' }, 500);
  }
});

// ============================================
// 2. GET /api/meetups - List Meet-ups
// ============================================

app.get('/', async (c) => {
  try {
    const status = c.req.query('status') || 'all';
    const limit = parseInt(c.req.query('limit') || '20');
    const supabase = createSupabaseClient(c.env);

    // Build query
    let query = supabase
      .from('group_meetups')
      .select(`
        id, title, description, image_url, donation_mode,
        scheduled_at, duration_minutes, target_donation_amount,
        status, created_at,
        organizer:organizer_id (
          discord_id,
          discord_username,
          discord_avatar
        )
      `)
      .order('scheduled_at', { ascending: false })
      .limit(limit);

    // Filter by status
    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: meetups, error } = await query;

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    // Get participant stats for each meetup
    const meetupIds = meetups?.map((m: any) => m.id) || [];
    const { data: participantStats } = await supabase
      .from('meetup_participants')
      .select('meetup_id, pledged_amount, attended, actual_donated_amount, donation_status');

    // Aggregate stats
    const statsMap = new Map<string, { participant_count: number; total_pledged: number; attended_count: number; total_donated: number }>();

    participantStats?.forEach((p: any) => {
      const existing = statsMap.get(p.meetup_id) || { participant_count: 0, total_pledged: 0, attended_count: 0, total_donated: 0 };
      existing.participant_count += 1;
      existing.total_pledged += p.pledged_amount || 0;
      if (p.attended) existing.attended_count += 1;
      if (p.donation_status === 'completed') existing.total_donated += p.actual_donated_amount || 0;
      statsMap.set(p.meetup_id, existing);
    });

    // Combine meetup data with stats
    const result: MeetupWithStats[] = meetups?.map((m: any) => {
      const stats = statsMap.get(m.id) || { participant_count: 0, total_pledged: 0, attended_count: 0, total_donated: 0 };
      return {
        id: m.id,
        title: m.title,
        description: m.description,
        image_url: m.image_url,
        donation_mode: m.donation_mode,
        scheduled_at: m.scheduled_at,
        duration_minutes: m.duration_minutes,
        target_donation_amount: m.target_donation_amount,
        status: m.status,
        created_at: m.created_at,
        organizer: {
          discord_id: m.organizer.discord_id,
          discord_username: m.organizer.discord_username,
          discord_avatar: m.organizer.discord_avatar,
        },
        participant_count: stats.participant_count,
        total_pledged: stats.total_pledged,
        attended_count: stats.attended_count,
        total_donated: stats.total_donated,
      };
    }) || [];

    return c.json({
      success: true,
      data: result,
      count: result.length,
    });
  } catch (error) {
    console.error('Exception in GET /meetups:', error);
    return c.json({ error: 'Failed to fetch meetups' }, 500);
  }
});

// ============================================
// 3. GET /api/meetups/:id - Get Meet-up Details
// ============================================

app.get('/:id', async (c) => {
  try {
    const meetupId = c.req.param('id');
    const supabase = createSupabaseClient(c.env);

    // Get meetup with organizer info
    const { data: meetup, error: meetupError } = await supabase
      .from('group_meetups')
      .select(`
        *,
        organizer:organizer_id (
          discord_id,
          discord_username,
          discord_avatar
        )
      `)
      .eq('id', meetupId)
      .single();

    if (meetupError || !meetup) {
      return c.json({ error: 'Meetup not found' }, 404);
    }

    // Get participants
    const { data: participants, error: participantsError } = await supabase
      .from('meetup_participants')
      .select(`
        user_id,
        pledged_amount,
        attended,
        donation_status,
        actual_donated_amount,
        joined_at,
        users:user_id (
          discord_username,
          discord_avatar
        )
      `)
      .eq('meetup_id', meetupId);

    if (participantsError) {
      return c.json({ error: participantsError.message }, 500);
    }

    // Calculate aggregated stats
    let total_pledged = 0;
    let attended_count = 0;
    let total_donated = 0;

    const participantList = participants?.map((p: any) => {
      total_pledged += p.pledged_amount || 0;
      if (p.attended) attended_count += 1;
      if (p.donation_status === 'completed') total_donated += p.actual_donated_amount || 0;

      return {
        user_id: p.user_id,
        discord_username: p.users.discord_username,
        discord_avatar: p.users.discord_avatar,
        pledged_amount: p.pledged_amount,
        attended: p.attended,
        donation_status: p.donation_status,
        actual_donated_amount: p.actual_donated_amount,
        joined_at: p.joined_at,
      };
    }) || [];

    const result: MeetupDetails = {
      ...meetup,
      organizer: {
        discord_id: meetup.organizer.discord_id,
        discord_username: meetup.organizer.discord_username,
        discord_avatar: meetup.organizer.discord_avatar,
      },
      participants: participantList,
      total_pledged,
      participant_count: participantList.length,
      attended_count,
      total_donated,
    };

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Exception in GET /meetups/:id:', error);
    return c.json({ error: 'Failed to fetch meetup details' }, 500);
  }
});

// ============================================
// 4. POST /api/meetups/:id/join - Join Meet-up
// ============================================

const joinMeetupSchema = z.object({
  discord_id: z.string(),
  pledged_amount: z.number().int().positive(),
});

app.post('/:id/join', async (c) => {
  try {
    const meetupId = c.req.param('id');
    const body = await c.req.json();
    const validated = joinMeetupSchema.parse(body);
    const supabase = createSupabaseClient(c.env);

    // Get user ID
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('discord_id', validated.discord_id)
      .single();

    if (userError || !userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Check if meetup exists
    const { data: meetup, error: meetupError } = await supabase
      .from('group_meetups')
      .select('id, status')
      .eq('id', meetupId)
      .single();

    if (meetupError || !meetup) {
      return c.json({ error: 'Meetup not found' }, 404);
    }

    if (meetup.status !== 'scheduled' && meetup.status !== 'in_progress') {
      return c.json({ error: 'Cannot join this meetup' }, 400);
    }

    // Join meetup
    const { data, error } = await supabase
      .from('meetup_participants')
      .insert({
        meetup_id: meetupId,
        user_id: userData.id,
        pledged_amount: validated.pledged_amount,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Unique violation
        return c.json({ error: 'Already joined this meetup' }, 400);
      }
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
      data: {
        participant_id: data.id,
        meetup_id: meetupId,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request body', details: error.errors }, 400);
    }
    console.error('Exception in POST /meetups/:id/join:', error);
    return c.json({ error: 'Failed to join meetup' }, 500);
  }
});

// ============================================
// 5. POST /api/meetups/:id/leave - Leave Meet-up
// ============================================

const leaveMeetupSchema = z.object({
  discord_id: z.string(),
});

app.post('/:id/leave', async (c) => {
  try {
    const meetupId = c.req.param('id');
    const body = await c.req.json();
    const validated = leaveMeetupSchema.parse(body);
    const supabase = createSupabaseClient(c.env);

    // Get user ID
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('discord_id', validated.discord_id)
      .single();

    if (userError || !userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Delete participation
    const { error } = await supabase
      .from('meetup_participants')
      .delete()
      .eq('meetup_id', meetupId)
      .eq('user_id', userData.id);

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request body', details: error.errors }, 400);
    }
    console.error('Exception in POST /meetups/:id/leave:', error);
    return c.json({ error: 'Failed to leave meetup' }, 500);
  }
});

// ============================================
// 6. POST /api/meetups/:id/generate-qr - Generate QR Code (Organizer only)
// ============================================

const generateQRSchema = z.object({
  discord_id: z.string(),
});

app.post('/:id/generate-qr', async (c) => {
  try {
    const meetupId = c.req.param('id');
    const body = await c.req.json();
    const validated = generateQRSchema.parse(body);
    const supabase = createSupabaseClient(c.env);

    // Check if user is organizer
    const isOrg = await isOrganizer(supabase, meetupId, validated.discord_id);
    if (!isOrg) {
      return c.json({ error: 'Only organizer can generate QR code' }, 403);
    }

    // Generate QR data
    const secretKey = c.env.SUPABASE_ANON_KEY; // Use Supabase key as secret
    const { qrData, expiresAt } = await generateQRData(meetupId, secretKey);

    // Generate QR code URL using api.qrserver.com
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}`;

    // Update meetup with QR data
    const { error: updateError } = await supabase
      .from('group_meetups')
      .update({
        qr_code_url: qrCodeUrl,
        qr_code_data: qrData,
        qr_code_expires_at: expiresAt.toISOString(),
      })
      .eq('id', meetupId);

    if (updateError) {
      return c.json({ error: updateError.message }, 500);
    }

    return c.json({
      success: true,
      data: {
        qr_code_url: qrCodeUrl,
        qr_data: qrData,
        expires_at: expiresAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request body', details: error.errors }, 400);
    }
    console.error('Exception in POST /meetups/:id/generate-qr:', error);
    return c.json({ error: 'Failed to generate QR code' }, 500);
  }
});

// ============================================
// 7. POST /api/meetups/:id/check-in - QR Check-in
// ============================================

const checkInSchema = z.object({
  discord_id: z.string(),
  qr_data: z.string(),
});

app.post('/:id/check-in', async (c) => {
  try {
    const meetupId = c.req.param('id');
    const body = await c.req.json();
    const validated = checkInSchema.parse(body);
    const supabase = createSupabaseClient(c.env);

    // Get user ID
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('discord_id', validated.discord_id)
      .single();

    if (userError || !userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Verify QR data
    const secretKey = c.env.SUPABASE_ANON_KEY;
    const verification = await verifyQRData(validated.qr_data, secretKey);

    if (!verification.valid) {
      return c.json({ error: verification.error }, 400);
    }

    if (verification.meetupId !== meetupId) {
      return c.json({ error: 'QR code does not match this meetup' }, 400);
    }

    // Check if user is a participant
    const { data: participant, error: participantError } = await supabase
      .from('meetup_participants')
      .select('id, attended')
      .eq('meetup_id', meetupId)
      .eq('user_id', userData.id)
      .single();

    if (participantError || !participant) {
      return c.json({ error: 'Not a participant of this meetup' }, 400);
    }

    if (participant.attended) {
      return c.json({ error: 'Already checked in' }, 400);
    }

    // Update attendance
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('meetup_participants')
      .update({
        attended: true,
        attended_at: now,
      })
      .eq('id', participant.id);

    if (updateError) {
      return c.json({ error: updateError.message }, 500);
    }

    return c.json({
      success: true,
      data: {
        attended: true,
        attended_at: now,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request body', details: error.errors }, 400);
    }
    console.error('Exception in POST /meetups/:id/check-in:', error);
    return c.json({ error: 'Failed to check in' }, 500);
  }
});

// ============================================
// 8. POST /api/meetups/:id/update-status - Update Status (Organizer only)
// ============================================

const updateStatusSchema = z.object({
  discord_id: z.string(),
  status: z.enum(['in_progress', 'completed', 'cancelled']),
});

app.post('/:id/update-status', async (c) => {
  try {
    const meetupId = c.req.param('id');
    const body = await c.req.json();
    const validated = updateStatusSchema.parse(body);
    const supabase = createSupabaseClient(c.env);

    // Check if user is organizer
    const isOrg = await isOrganizer(supabase, meetupId, validated.discord_id);
    if (!isOrg) {
      return c.json({ error: 'Only organizer can update status' }, 403);
    }

    // Update status
    const updateData: any = {
      status: validated.status,
    };

    if (validated.status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('group_meetups')
      .update(updateData)
      .eq('id', meetupId);

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      success: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request body', details: error.errors }, 400);
    }
    console.error('Exception in POST /meetups/:id/update-status:', error);
    return c.json({ error: 'Failed to update status' }, 500);
  }
});

// ============================================
// 9. GET /api/meetups/my-pending-donations - Get Pending Donations
// ============================================

app.get('/my-pending-donations', async (c) => {
  try {
    const discordId = c.req.query('discord_id');

    if (!discordId) {
      return c.json({ error: 'discord_id is required' }, 400);
    }

    const supabase = createSupabaseClient(c.env);

    // Get user ID
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('discord_id', discordId)
      .single();

    if (userError || !userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Get pending donations
    const { data: participants, error } = await supabase
      .from('meetup_participants')
      .select(`
        meetup_id,
        pledged_amount,
        attended,
        meetups:meetup_id (
          title,
          image_url,
          completed_at
        )
      `)
      .eq('user_id', userData.id)
      .eq('attended', true)
      .eq('donation_status', 'pending');

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    const result: PendingMeetupDonation[] = participants?.map((p: any) => ({
      meetup_id: p.meetup_id,
      title: p.meetups.title,
      image_url: p.meetups.image_url,
      pledged_amount: p.pledged_amount,
      attended: p.attended,
      completed_at: p.meetups.completed_at,
    })) || [];

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Exception in GET /meetups/my-pending-donations:', error);
    return c.json({ error: 'Failed to fetch pending donations' }, 500);
  }
});

// ============================================
// 10. POST /api/meetups/:id/complete-donation - Complete Donation
// ============================================

const completeDonationSchema = z.object({
  discord_id: z.string(),
  amount: z.number().int().positive(),
});

app.post('/:id/complete-donation', async (c) => {
  try {
    const meetupId = c.req.param('id');
    const body = await c.req.json();
    const validated = completeDonationSchema.parse(body);
    const supabase = createSupabaseClient(c.env);

    // Get user ID
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('discord_id', validated.discord_id)
      .single();

    if (userError || !userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Get participant record
    const { data: participant, error: participantError } = await supabase
      .from('meetup_participants')
      .select('id, attended, donation_status')
      .eq('meetup_id', meetupId)
      .eq('user_id', userData.id)
      .single();

    if (participantError || !participant) {
      return c.json({ error: 'Not a participant of this meetup' }, 400);
    }

    if (!participant.attended) {
      return c.json({ error: 'Must check in before donating' }, 400);
    }

    if (participant.donation_status === 'completed') {
      return c.json({ error: 'Already donated' }, 400);
    }

    // Get meetup info for donation
    const { data: meetup, error: meetupError } = await supabase
      .from('group_meetups')
      .select('title, donation_mode')
      .eq('id', meetupId)
      .single();

    if (meetupError || !meetup) {
      return c.json({ error: 'Meetup not found' }, 404);
    }

    // Create donation record
    const { data: donation, error: donationError } = await supabase
      .from('donations')
      .insert({
        user_id: userData.id,
        amount: validated.amount,
        currency: 'SAT',
        donation_mode: meetup.donation_mode,
        donation_scope: 'meetup',
        note: `Group meetup: ${meetup.title}`,
        status: 'completed',
        date: new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (donationError) {
      return c.json({ error: donationError.message }, 500);
    }

    // Update participant record
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('meetup_participants')
      .update({
        donation_status: 'completed',
        actual_donated_amount: validated.amount,
        donated_at: now,
        donation_id: donation.id,
      })
      .eq('id', participant.id);

    if (updateError) {
      return c.json({ error: updateError.message }, 500);
    }

    return c.json({
      success: true,
      data: {
        donation_id: donation.id,
        meetup_id: meetupId,
        amount: validated.amount,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request body', details: error.errors }, 400);
    }
    console.error('Exception in POST /meetups/:id/complete-donation:', error);
    return c.json({ error: 'Failed to complete donation' }, 500);
  }
});

export default app;
