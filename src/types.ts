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
  user_id: string;
  discord_message_id: string;
  channel_id: string;
  content: string;
  created_at: string;
}

export interface PostReaction {
  id: string;
  post_id: string;
  reaction_count: number;
  comment_count: number;
  total_engagement: number;
  updated_at: string;
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

export interface TopPost {
  id: string;
  content: string;
  discord_message_id: string;
  channel_id: string;
  discord_username: string;
  discord_avatar?: string;
  reaction_count: number;
  comment_count: number;
  total_engagement: number;
  created_at: string;
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
