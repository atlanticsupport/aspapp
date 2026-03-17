-- Migration 003: Add Foreign Key Constraints
-- Created: 2026-03-13
-- Purpose: Enforce referential integrity

-- Note: SQLite requires PRAGMA foreign_keys = ON and table recreation

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Step 1: Create movements table with FK
CREATE TABLE IF NOT EXISTS movements_fk (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('in', 'out', 'adjustment', 'transfer')),
    quantity INTEGER NOT NULL CHECK(quantity != 0),
    reason TEXT,
    unit_price REAL CHECK(unit_price >= 0),
    supplier TEXT,
    po_number TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Migrate data
INSERT INTO movements_fk SELECT * FROM movements;
DROP TABLE movements;
ALTER TABLE movements_fk RENAME TO movements;

-- Step 2: Create attachments table with FK
CREATE TABLE IF NOT EXISTS attachments_fk (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    file_type TEXT,
    category TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Migrate data
INSERT INTO attachments_fk SELECT * FROM attachments;
DROP TABLE attachments;
ALTER TABLE attachments_fk RENAME TO attachments;

-- Step 3: Create historico_geral table with FK (optional, for user tracking)
CREATE TABLE IF NOT EXISTS historico_geral_fk (
    id TEXT PRIMARY KEY,
    tabela_nome TEXT NOT NULL,
    operacao TEXT NOT NULL,
    dados_antigos TEXT,
    dados_novos TEXT,
    utilizador_id TEXT,
    utilizador_nome TEXT,
    criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
    foi_revertido INTEGER DEFAULT 0,
    revertido_por TEXT,
    revertido_em TEXT,
    eh_reversao INTEGER DEFAULT 0,
    FOREIGN KEY (utilizador_id) REFERENCES app_users(id) ON DELETE SET NULL
);

-- Migrate data
INSERT INTO historico_geral_fk SELECT * FROM historico_geral;
DROP TABLE historico_geral;
ALTER TABLE historico_geral_fk RENAME TO historico_geral;

-- Step 4: Create app_events table with FK
CREATE TABLE IF NOT EXISTS app_events_fk (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    target_id TEXT,
    title TEXT NOT NULL,
    summary TEXT,
    details TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    reverted_at TEXT,
    reverted_by TEXT,
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
);

-- Migrate data
INSERT INTO app_events_fk SELECT * FROM app_events;
DROP TABLE app_events;
ALTER TABLE app_events_fk RENAME TO app_events;
