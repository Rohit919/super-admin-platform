-- Initialize database extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- Query statistics for slow-query / N+1 analysis (see scripts/analyze-queries.ts).
-- Requires shared_preload_libraries=pg_stat_statements — set in docker-compose command.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Create default schema if needed
CREATE SCHEMA IF NOT EXISTS public;

-- Grant permissions
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
