-- 0004 enabled row level security on memory_versions with select and insert
-- policies only, so the write path's own trim (`delete ... where memory_id = $1`)
-- silently matched nothing and history grew until the nightly job. A writer may
-- discard this project's history: they can already delete the memory itself.
create policy memory_version_delete on memory_versions
  for delete using (can_write_project(project_id));

-- Every cascade from a purged memory, and every trim, looks up by memory_id.
create index memory_versions_memory_idx
  on memory_versions (memory_id, created_at desc);
