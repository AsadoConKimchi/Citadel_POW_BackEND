-- ============================================
-- Citadel POW - Group Meetups Migration
-- ============================================
-- Created: 2026-01-10
-- Purpose: Add group POW meetup functionality with QR attendance
-- ============================================

-- ============================================
-- Table 1: group_meetups
-- ============================================

CREATE TABLE IF NOT EXISTS group_meetups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Meet-up Information
  title VARCHAR(200) NOT NULL,
  description TEXT,
  image_url TEXT,
  donation_mode VARCHAR(50) DEFAULT 'pow-writing',

  -- Schedule
  scheduled_at TIMESTAMP NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),

  -- Donation Target
  target_donation_amount INTEGER NOT NULL CHECK (target_donation_amount > 0), -- sats

  -- Status
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),

  -- QR Code (stored only when generated)
  qr_code_url TEXT,
  qr_code_data TEXT, -- The actual QR data: meetup:{id}:{timestamp}:{checksum}
  qr_code_expires_at TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  completed_at TIMESTAMP
);

-- Indexes for group_meetups
CREATE INDEX idx_group_meetups_status ON group_meetups(status);
CREATE INDEX idx_group_meetups_scheduled_at ON group_meetups(scheduled_at DESC);
CREATE INDEX idx_group_meetups_organizer_id ON group_meetups(organizer_id);
CREATE INDEX idx_group_meetups_donation_mode ON group_meetups(donation_mode);

-- ============================================
-- Table 2: meetup_participants
-- ============================================

CREATE TABLE IF NOT EXISTS meetup_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meetup_id UUID NOT NULL REFERENCES group_meetups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Participation Information
  pledged_amount INTEGER NOT NULL CHECK (pledged_amount > 0), -- Pledged donation amount (sats)
  actual_donated_amount INTEGER DEFAULT 0 CHECK (actual_donated_amount >= 0), -- Actual donated amount

  -- Attendance Check
  attended BOOLEAN DEFAULT false,
  attended_at TIMESTAMP,

  -- Donation Status
  donation_status VARCHAR(20) DEFAULT 'pending' CHECK (donation_status IN ('pending', 'completed', 'skipped')),
  donated_at TIMESTAMP,
  donation_id UUID REFERENCES donations(id) ON DELETE SET NULL,

  -- Metadata
  joined_at TIMESTAMP DEFAULT now(),

  -- Ensure each user can only join a meetup once
  UNIQUE(meetup_id, user_id)
);

-- Indexes for meetup_participants
CREATE INDEX idx_meetup_participants_meetup_id ON meetup_participants(meetup_id);
CREATE INDEX idx_meetup_participants_user_id ON meetup_participants(user_id);
CREATE INDEX idx_meetup_participants_donation_status ON meetup_participants(donation_status);
CREATE INDEX idx_meetup_participants_attended ON meetup_participants(attended);

-- ============================================
-- Triggers
-- ============================================

-- Update updated_at timestamp on group_meetups
CREATE OR REPLACE FUNCTION update_group_meetups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_group_meetups_updated_at
  BEFORE UPDATE ON group_meetups
  FOR EACH ROW
  EXECUTE FUNCTION update_group_meetups_updated_at();

-- ============================================
-- Views (optional, for convenience)
-- ============================================

-- View: meetup_stats
-- Aggregated statistics for each meetup
CREATE OR REPLACE VIEW meetup_stats AS
SELECT
  gm.id AS meetup_id,
  gm.title,
  gm.status,
  gm.scheduled_at,
  gm.target_donation_amount,
  COUNT(mp.id) AS participant_count,
  COALESCE(SUM(mp.pledged_amount), 0) AS total_pledged,
  COALESCE(SUM(CASE WHEN mp.attended THEN 1 ELSE 0 END), 0) AS attended_count,
  COALESCE(SUM(CASE WHEN mp.donation_status = 'completed' THEN mp.actual_donated_amount ELSE 0 END), 0) AS total_donated
FROM group_meetups gm
LEFT JOIN meetup_participants mp ON gm.id = mp.meetup_id
GROUP BY gm.id, gm.title, gm.status, gm.scheduled_at, gm.target_donation_amount;

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE group_meetups IS 'Group POW meetup events organized by users with Organizer role';
COMMENT ON TABLE meetup_participants IS 'Participants who joined a group meetup with their pledged donation amount';
COMMENT ON COLUMN group_meetups.qr_code_data IS 'QR data format: meetup:{id}:{timestamp}:{checksum}';
COMMENT ON COLUMN group_meetups.qr_code_expires_at IS 'QR code expires after 1 hour from generation';
COMMENT ON COLUMN meetup_participants.pledged_amount IS 'Amount the participant promised to donate (sats)';
COMMENT ON COLUMN meetup_participants.actual_donated_amount IS 'Actual amount donated after meetup completion (sats)';

-- ============================================
-- Sample Data (for testing, comment out in production)
-- ============================================

-- Uncomment below to insert sample data for testing

-- INSERT INTO group_meetups (organizer_id, title, description, donation_mode, scheduled_at, duration_minutes, target_donation_amount, status)
-- VALUES (
--   (SELECT id FROM users WHERE discord_id = '1340338561899303005' LIMIT 1),
--   'Bitcoin Study Meetup',
--   'Weekly Bitcoin technical discussion and POW session',
--   'pow-writing',
--   now() + interval '2 days',
--   120,
--   100,
--   'scheduled'
-- );

-- ============================================
-- Migration Complete
-- ============================================

-- To verify the migration:
-- SELECT * FROM group_meetups;
-- SELECT * FROM meetup_participants;
-- SELECT * FROM meetup_stats;
