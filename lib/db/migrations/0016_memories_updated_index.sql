-- The digest and the tree both read a project's newest rows; without this the
-- planner sorts the whole table for every session start.
create index memories_project_updated on memories (project_id, updated_at desc)
  where deleted_at is null;
