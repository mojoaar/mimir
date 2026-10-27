-- A vector with no provenance cannot answer "is this the model we use now?".
-- Old rows stay null: their model is unknowable, and null is honest.
alter table memories add column embedded_at timestamptz;
alter table memories add column embedding_model text;
