-- Dev and test only. A real deployment creates this role with its own password.
-- POSTGRES_USER is mimir_owner, so that role already exists and owns the database.
CREATE ROLE mimir_app LOGIN PASSWORD 'app_dev_password';
CREATE DATABASE mimir_test OWNER mimir_owner;
