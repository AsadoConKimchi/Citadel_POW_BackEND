export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ENVIRONMENT: string;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_WEBHOOK_URL?: string;
}

export interface User {
  id: string;
  discord_id: string;
  discord_username: string;
  discord_avatar?: string;
  created_at: string;
  updated_at: string;
}

export interface Ranking {
  id: string;
  user_id: string;
  pow_score: number;
  rank: number;
  week_number: number;
  year: number;
  created_at: string;
  updated_at: string;
}

export interface Donation {
  id: string;
  user_id: string;

  // 기부 정보
  amount: number;                // 기부금액 (sats)
  currency: string;              // 'SAT'
  donation_mode: string;         // POW 분야
  donation_scope: string;        // 'session' | 'total'
  note?: string;                 // 기부메모 (null 가능)

  // POW 정보 (기부 시점 스냅샷)
  plan_text?: string;            // 오늘의 목표
  duration_minutes?: number;     // 달성시간
  duration_seconds?: number;     // 달성시간 (초)
  goal_minutes?: number;         // 목표시간
  achievement_rate?: number;     // 달성률 (%)
  photo_url?: string;            // 인증카드 이미지 URL

  // 누적 정보 (기부 시점 스냅샷)
  accumulated_sats?: number;     // 이번 기부로 적립된 금액
  total_accumulated_sats?: number; // 기부 시점의 총 적립액
  total_donated_sats?: number;   // 기부 시점의 누적 기부액

  // 결제 정보
  transaction_id?: string;
  status: 'pending' | 'completed' | 'failed';
  date: string;                  // YYYY-MM-DD
  session_id?: string;           // 연결된 세션 ID

  // Deprecated
  message?: string;              // deprecated, use note

  created_at: string;
}

export interface DiscordPost {
  id: string;
  message_id: string;            // Discord 메시지 ID (unique)
  channel_id: string;
  user_id: string;
  session_id?: string;           // 연결된 study_session ID (nullable)
  photo_url?: string;            // 인증카드 이미지 URL
  plan_text?: string;            // 목표 텍스트
  donation_mode?: string;        // POW 분야
  reaction_count: number;        // 총 반응 수
  reactions: Record<string, number>; // 반응 상세 { "👍": 5, "❤️": 3 }
  created_at: string;
  updated_at: string;
}

export interface PopularPost {
  id: string;
  message_id: string;
  channel_id: string;
  user_id: string;
  session_id?: string;
  photo_url?: string;
  plan_text?: string;
  donation_mode?: string;
  reaction_count: number;
  reactions: Record<string, number>;
  created_at: string;
  // User 정보 (JOIN)
  discord_username: string;
  discord_avatar?: string;
  // StudySession 정보 (LEFT JOIN)
  duration_minutes?: number;
  goal_minutes?: number;
  achievement_rate?: number;
}

export interface LeaderboardEntry {
  discord_username: string;
  discord_avatar?: string;
  pow_score: number;
  rank: number;
  week_number: number;
  year: number;
  updated_at: string;
}

export interface TopDonor {
  discord_username: string;
  discord_avatar?: string;
  total_donated: number;
  donation_count: number;
  last_donation_at: string;
}

export interface RankingEntry {
  rank: number;
  discord_id: string;
  discord_username: string;
  discord_avatar?: string;
  total_minutes?: number;        // POW 시간 기준
  total_donations?: number;      // 기부 금액 기준
  session_count?: number;
  last_activity_at?: string;
}

export interface StudySession {
  id: string;
  user_id: string;

  // POW 정보
  donation_mode: string;         // POW 분야 (pow-writing, pow-music, etc.)
  plan_text: string;             // 오늘의 목표

  // 시간 정보
  start_time: string;
  end_time: string;
  duration_minutes: number;      // 실제 달성시간
  goal_minutes: number;          // 목표시간
  achievement_rate: number;      // 달성률 (%)

  // 인증카드
  photo_url?: string;            // 인증카드 이미지 URL

  // 기부 연결
  donation_id?: string;          // 연결된 기부 ID (nullable)

  // Discord 연동
  discord_message_id?: string;   // Discord 메시지 ID (nullable)
  reaction_count?: number;       // Discord 반응 수 (기본값 0)

  created_at: string;
}

export interface UserStudyStats {
  discord_username: string;
  discord_avatar?: string;
  discord_id: string;
  total_sessions: number;
  total_study_minutes: number;
  avg_session_minutes: number;
  last_study_at: string;
}

export interface AccumulatedSats {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  total_seconds: number;
  total_sats: number;
  plan_text?: string;
  goal_minutes?: number;
  donation_mode: string;
  note?: string;
  created_at: string;
  updated_at: string;
}

// ============================================
// Group Meetup Types
// ============================================

export interface GroupMeetup {
  id: string;
  organizer_id: string;

  // Meet-up Information
  title: string;
  description?: string;
  image_url?: string;
  donation_mode: string;

  // Schedule
  scheduled_at: string;
  duration_minutes: number;

  // Donation Target
  target_donation_amount: number;

  // Status
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

  // QR Code
  qr_code_url?: string;
  qr_code_data?: string;
  qr_code_expires_at?: string;

  // Metadata
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface MeetupParticipant {
  id: string;
  meetup_id: string;
  user_id: string;

  // Participation Information
  pledged_amount: number;
  actual_donated_amount: number;

  // Attendance Check
  attended: boolean;
  attended_at?: string;

  // Donation Status
  donation_status: 'pending' | 'completed' | 'skipped';
  donated_at?: string;
  donation_id?: string;

  // Metadata
  joined_at: string;
}

export interface MeetupWithStats {
  id: string;
  title: string;
  description?: string;
  image_url?: string;
  donation_mode: string;
  scheduled_at: string;
  duration_minutes: number;
  target_donation_amount: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;

  // Organizer info (from JOIN)
  organizer: {
    discord_id: string;
    discord_username: string;
    discord_avatar?: string;
  };

  // Aggregated stats
  participant_count: number;
  total_pledged: number;
  attended_count?: number;
  total_donated?: number;
}

export interface MeetupDetails extends GroupMeetup {
  // Organizer info (from JOIN)
  organizer: {
    discord_id: string;
    discord_username: string;
    discord_avatar?: string;
  };

  // Participants list (from JOIN)
  participants: Array<{
    user_id: string;
    discord_username: string;
    discord_avatar?: string;
    pledged_amount: number;
    attended: boolean;
    donation_status: 'pending' | 'completed' | 'skipped';
    actual_donated_amount?: number;
    joined_at: string;
  }>;

  // Aggregated stats
  total_pledged: number;
  participant_count: number;
  attended_count: number;
  total_donated: number;
}

export interface PendingMeetupDonation {
  meetup_id: string;
  title: string;
  image_url?: string;
  pledged_amount: number;
  attended: boolean;
  completed_at?: string;
}
