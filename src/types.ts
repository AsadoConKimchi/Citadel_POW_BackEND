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
  amount: number;
  currency: string;
  message?: string;
  transaction_id?: string;
  status: 'pending' | 'completed' | 'failed';
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
