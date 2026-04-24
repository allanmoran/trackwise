-- Performance Indexes for Phase 2A Optimization
-- These dramatically speed up prediction queries

-- Horse stats queries (used every pick generation)
CREATE INDEX IF NOT EXISTS idx_race_runners_horse_id 
  ON race_runners(horse_id);

CREATE INDEX IF NOT EXISTS idx_race_runners_horse_result 
  ON race_runners(horse_id, result);

-- Jockey/Trainer stats queries
CREATE INDEX IF NOT EXISTS idx_race_runners_jockey_id 
  ON race_runners(jockey_id);

CREATE INDEX IF NOT EXISTS idx_race_runners_trainer_id 
  ON race_runners(trainer_id);

CREATE INDEX IF NOT EXISTS idx_race_runners_race_id 
  ON race_runners(race_id);

-- Race lookup queries
CREATE INDEX IF NOT EXISTS idx_races_date_track 
  ON races(date, track);

-- Batch betting queries
CREATE INDEX IF NOT EXISTS idx_bets_placed_at 
  ON bets(placed_at);

CREATE INDEX IF NOT EXISTS idx_bets_status 
  ON bets(status);

-- Verify indexes exist
SELECT name FROM sqlite_master 
WHERE type = 'index' AND name LIKE 'idx_%';
