select * from entries

  ALTER TABLE matches ADD COLUMN home_score integer;
  ALTER TABLE matches ADD COLUMN away_score integer;
  ALTER TABLE entries ADD COLUMN home_score_pred integer;
  ALTER TABLE entries ADD COLUMN away_score_pred integer;