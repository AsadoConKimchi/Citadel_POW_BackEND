-- ============================================
-- Fix VARCHAR(500) limitations
-- Migration: 007_fix_text_field_lengths
-- Date: 2026-01-11
-- ============================================

-- study_sessions 테이블의 텍스트 필드를 TEXT로 변경
ALTER TABLE study_sessions
ALTER COLUMN plan_text TYPE TEXT;

ALTER TABLE study_sessions
ALTER COLUMN photo_url TYPE TEXT;

-- 확인 메시지
DO $$
BEGIN
  RAISE NOTICE '✅ study_sessions.plan_text: VARCHAR → TEXT';
  RAISE NOTICE '✅ study_sessions.photo_url: VARCHAR → TEXT';
END $$;
