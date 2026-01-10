-- ============================================
-- 기존 study_sessions의 Discord 메시지 데이터를 discord_posts로 마이그레이션
-- Migration: 004_migrate_existing_discord_data
-- Date: 2026-01-10
-- ============================================

-- ============================================
-- 1. 먼저 discord_posts 테이블과 popular_posts 뷰 확인/생성
-- ============================================

-- discord_posts 테이블이 없으면 생성 (002 마이그레이션)
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

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_discord_posts_message_id ON discord_posts(message_id);
CREATE INDEX IF NOT EXISTS idx_discord_posts_user_id ON discord_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_discord_posts_reaction_count ON discord_posts(reaction_count DESC);
CREATE INDEX IF NOT EXISTS idx_discord_posts_donation_mode ON discord_posts(donation_mode);
CREATE INDEX IF NOT EXISTS idx_discord_posts_created_at ON discord_posts(created_at DESC);

-- study_sessions에 discord_message_id, reaction_count 추가
ALTER TABLE study_sessions
ADD COLUMN IF NOT EXISTS discord_message_id VARCHAR(50);

ALTER TABLE study_sessions
ADD COLUMN IF NOT EXISTS reaction_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_study_sessions_discord_message_id ON study_sessions(discord_message_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_reaction_count ON study_sessions(reaction_count DESC);

-- popular_posts 뷰 생성
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
  u.discord_id,
  ss.duration_minutes,
  ss.duration_seconds,
  ss.goal_minutes,
  ss.achievement_rate
FROM discord_posts dp
JOIN users u ON dp.user_id = u.id
LEFT JOIN study_sessions ss ON dp.session_id = ss.id
ORDER BY dp.reaction_count DESC, dp.created_at DESC;

-- ============================================
-- 2. 기존 study_sessions 데이터를 discord_posts로 마이그레이션
-- ============================================

-- discord_message_id가 있는 세션들을 discord_posts에 삽입
-- (이미 존재하는 message_id는 건너뜀)
INSERT INTO discord_posts (
  message_id,
  channel_id,
  user_id,
  session_id,
  photo_url,
  plan_text,
  donation_mode,
  reaction_count,
  created_at,
  updated_at
)
SELECT
  ss.discord_message_id,
  '1330845896931319949' AS channel_id, -- POW 인증 채널 ID (실제 값으로 변경 필요)
  ss.user_id,
  ss.id,
  ss.photo_url,
  ss.plan_text,
  ss.donation_mode,
  COALESCE(ss.reaction_count, 0),
  ss.created_at,
  ss.created_at
FROM study_sessions ss
WHERE ss.discord_message_id IS NOT NULL
  AND ss.discord_message_id != ''
  AND NOT EXISTS (
    SELECT 1 FROM discord_posts dp
    WHERE dp.message_id = ss.discord_message_id
  );

-- ============================================
-- 3. 통계 출력
-- ============================================

DO $$
DECLARE
  total_discord_posts INTEGER;
  total_sessions_with_discord_id INTEGER;
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_discord_posts FROM discord_posts;
  SELECT COUNT(*) INTO total_sessions_with_discord_id FROM study_sessions WHERE discord_message_id IS NOT NULL;

  migrated_count := total_discord_posts;

  RAISE NOTICE '✅ 마이그레이션 완료';
  RAISE NOTICE '📊 discord_posts 총 레코드 수: %', total_discord_posts;
  RAISE NOTICE '📊 discord_message_id가 있는 세션 수: %', total_sessions_with_discord_id;
  RAISE NOTICE '📊 마이그레이션된 레코드 수: %', migrated_count;
END $$;
