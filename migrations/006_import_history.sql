-- Migration 006: Create Import History Table
-- Created: 2026-03-13
-- Purpose: Track all import operations and allow reversion

CREATE TABLE IF NOT EXISTS import_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    table_name TEXT NOT NULL,
    total_items INTEGER NOT NULL,
    imported_items INTEGER NOT NULL,
    failed_items INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'reverted')),
    start_time TEXT NOT NULL,
    end_time TEXT,
    file_name TEXT,
    file_size INTEGER,
    chunk_count INTEGER DEFAULT 0,
    error_message TEXT,
    metadata TEXT, -- JSON with additional info
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES app_users(id)
);

CREATE TABLE IF NOT EXISTS import_items (
    id TEXT PRIMARY KEY,
    import_id TEXT NOT NULL,
    row_number INTEGER NOT NULL,
    item_id INTEGER, -- ID of the inserted item
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'success', 'failed', 'reverted')),
    error_message TEXT,
    data TEXT, -- JSON with original item data
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (import_id) REFERENCES import_history(id) ON DELETE CASCADE
);

-- Indexes for import history
CREATE INDEX IF NOT EXISTS idx_import_history_user_id ON import_history(user_id);
CREATE INDEX IF NOT EXISTS idx_import_history_table_name ON import_history(table_name);
CREATE INDEX IF NOT EXISTS idx_import_history_status ON import_history(status);
CREATE INDEX IF NOT EXISTS idx_import_history_created_at ON import_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_items_import_id ON import_items(import_id);
CREATE INDEX IF NOT EXISTS idx_import_items_status ON import_items(status);
