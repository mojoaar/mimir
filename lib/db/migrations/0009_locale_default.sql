-- An account that has never chosen a language must not look like it chose
-- English: the resolver reads '' as "fall through to the cookie or the browser".
-- Rows created before this migration keep 'en' and are treated as a choice.
alter table users alter column locale set default '';
