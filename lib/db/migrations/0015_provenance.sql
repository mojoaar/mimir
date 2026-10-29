-- Who wrote it, and in which session. Null for everything written before this,
-- which is honest: we did not record it. Never a partition, never in the digest.
alter table memories add column client text;
alter table memories add column session text;
alter table memory_versions add column client text;
alter table memory_versions add column session text;
