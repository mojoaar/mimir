-- 0.3.0: two-factor secrets and the indexes the audit viewer reads.
-- totp_secret_enc and totp_last_step already exist from 0001; an enrolment in
-- progress is kept apart so an abandoned setup never enables a login factor.
alter table users add column if not exists totp_pending_enc bytea;

create index if not exists audit_log_created_idx on audit_log (created_at desc);
create index if not exists audit_log_action_created_idx on audit_log (action, created_at desc);
