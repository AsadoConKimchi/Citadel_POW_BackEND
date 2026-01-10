-- ============================================
-- Citadel POW Discord 반응 수집 테이블 추가
-- Migration: 002_discord_posts
-- Date: 2026-01-10
-- ============================================

-- ============================================
-- 1. discord_posts 테이블 생성
-- ============================================

CREATE TABLE IF NOT EXISTS discord_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id VARCHAR(50) UNIQUE NOT NULL,
  channel_id VARCHAR(50) NOT NULL,
  user_id UUID NOT NULL,
  session_id UUID,
  photo_url TEXT,
  plan_text TEXT,
  donation_mode VARCHAR(50),
  reaction_count INTEGER DEFAULT 0,
  reactions JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),

  -- 외래 키
  CONSTRAINT fk_discord_posts_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_discord_posts_session_id FOREIGN KEY (session_id) REFERENCES study_sessions(id) ON DELETE SET NULL
);

-- 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_discord_posts_message_id ON discord_posts(message_id);
CREATE INDEX IF NOT EXISTS idx_discord_posts_user_id ON discord_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_discord_posts_reaction_count ON discord_posts(reaction_count DESC);
CREATE INDEX IF NOT EXISTS idx_discord_posts_donation_mode ON discord_posts(donation_mode);
CREATE INDEX IF NOT EXISTS idx_discord_posts_created_at ON discord_posts(created_at DESC);

-- ============================================
-- 2. study_sessions 테이블 확장
-- ============================================

-- Discord 메시지 ID 및 반응 수 추가
ALTER TABLE study_sessions
ADD COLUMN IF NOT EXISTS discord_message_id VARCHAR(50);

ALTER TABLE study_sessions
ADD COLUMN IF NOT EXISTS reaction_count INTEGER DEFAULT 0;

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_study_sessions_discord_message_id ON study_sessions(discord_message_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_reaction_count ON study_sessions(reaction_count DESC);

-- ============================================
-- 3. 뷰: popular_posts (인기 게시물)
-- ============================================

CREATE OR REPLACE VIEW popular_posts AS
SELECT
  dp.id,
  dp.message_id,
  dp.channel_id,
  dp.user_id,
  dp.session_id,
  dp.photo_url,
  dp.plan_text,
  dp.donation_mode,
  dp.reaction_count,
  dp.reactions,
  dp.created_at,
  u.discord_username,
  u.discord_avatar,
  ss.duration_minutes,
  ss.goal_minutes,
  ss.achievement_rate
FROM discord_posts dp
JOIN users u ON dp.user_id = u.id
LEFT JOIN study_sessions ss ON dp.session_id = ss.id
ORDER BY dp.reaction_count DESC, dp.created_at DESC;

-- ============================================
-- 완료 메시지
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ 마이그레이션 완료: discord_posts 테이블 및 뷰 생성';
  RAISE NOTICE '📊 추가된 테이블: discord_posts';
  RAISE NOTICE '📊 추가된 뷰: popular_posts';
  RAISE NOTICE '📊 study_sessions 확장: discord_message_id, reaction_count';
END $$;
