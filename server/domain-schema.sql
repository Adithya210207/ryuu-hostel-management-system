-- Every domain mutation locks this row. PostgreSQL serializes concurrent
-- reservations, approvals and workers; the JSONB aggregate is not a browser cache.
-- A versioned aggregate keeps this initial single-hostel deployment portable.
CREATE TABLE IF NOT EXISTS domain_state (
  id integer PRIMARY KEY CHECK (id = 1),
  schema_version integer NOT NULL DEFAULT 1,
  revision bigint NOT NULL DEFAULT 0,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
