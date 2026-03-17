-- Migration 007: Remove Foreign Key Constraint from import_history
-- Created: 2026-03-16
-- Purpose: Remove FK constraint to allow imports without strict user validation

-- SQLite doesn't support DROP CONSTRAINT, so we need to recreate the table

-- Step 1: Create new table without FK constraint
CREATE TABLE IF NOT EXISTS import_history_new (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    table_name TEXT NOT NULL,
    total_items INTEGER NOT NULL,
    imported_items INTEGER NOT NULL DEFAULT 0,
    failed_items INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'completed_with_errors', 'failed', 'reverted')),
    start_time TEXT NOT NULL,
    end_time TEXT,
    file_name TEXT,
    file_size INTEGER,
    chunk_count INTEGER DEFAULT 0,
    error_message TEXT,
    metadata TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Copy existing data
INSERT INTO import_history_new 
SELECT * FROM import_history;

-- Step 3: Drop old table
DROP TABLE import_history;

-- Step 4: Rename new table
ALTER TABLE import_history_new RENAME TO import_history;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_import_history_user_id ON import_history(user_id);
CREATE INDEX IF NOT EXISTS idx_import_history_table_name ON import_history(table_name);
CREATE INDEX IF NOT EXISTS idx_import_history_status ON import_history(status);
CREATE INDEX IF NOT EXISTS idx_import_history_created_at ON import_history(created_at DESC);
