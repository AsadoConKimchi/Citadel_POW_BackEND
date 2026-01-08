-- Study Sessions 테이블 추가
CREATE TABLE study_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER NOT NULL,
  plan_text TEXT,
  photo_url VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_study_sessions_user_id ON study_sessions(user_id);
CREATE INDEX idx_study_sessions_created_at ON study_sessions(created_at DESC);
CREATE INDEX idx_study_sessions_duration ON study_sessions(duration_minutes DESC);

-- View for user study statistics
CREATE OR REPLACE VIEW user_study_stats AS
SELECT
  u.discord_username,
  u.discord_avatar,
  u.discord_id,
  COUNT(ss.id) as total_sessions,
  SUM(ss.duration_minutes) as total_study_minutes,
  AVG(ss.duration_minutes) as avg_session_minutes,
  MAX(ss.created_at) as last_study_at
FROM users u
LEFT JOIN study_sessions ss ON u.id = ss.user_id
GROUP BY u.id, u.discord_username, u.discord_avatar, u.discord_id;

-- Function to calculate POW score from study time
-- POW Score = total study minutes for the week
CREATE OR REPLACE FUNCTION calculate_pow_score(user_uuid UUID, week_num INTEGER, year_num INTEGER)
RETURNS INTEGER AS $$
DECLARE
  total_minutes INTEGER;
BEGIN
  SELECT COALESCE(SUM(duration_minutes), 0)
  INTO total_minutes
  FROM study_sessions
  WHERE user_id = user_uuid
    AND EXTRACT(WEEK FROM created_at) = week_num
    AND EXTRACT(YEAR FROM created_at) = year_num;

  RETURN total_minutes;
END;
$$ LANGUAGE plpgsql;

-- Function to update user's POW score for current week
CREATE OR REPLACE FUNCTION update_user_pow_score(user_uuid UUID)
RETURNS void AS $$
DECLARE
  current_week INTEGER;
  current_year INTEGER;
  pow_score_value INTEGER;
BEGIN
  current_week := EXTRACT(WEEK FROM NOW())::INTEGER;
  current_year := EXTRACT(YEAR FROM NOW())::INTEGER;

  pow_score_value := calculate_pow_score(user_uuid, current_week, current_year);

  INSERT INTO rankings (user_id, pow_score, week_number, year)
  VALUES (user_uuid, pow_score_value, current_week, current_year)
  ON CONFLICT (user_id, week_number, year)
  DO UPDATE SET
    pow_score = pow_score_value,
    updated_at = NOW();

  PERFORM update_rankings();
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update POW score when a study session is added
CREATE OR REPLACE FUNCTION trigger_update_pow_score()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM update_user_pow_score(NEW.user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER study_session_update_pow AFTER INSERT ON study_sessions
  FOR EACH ROW EXECUTE FUNCTION trigger_update_pow_score();
