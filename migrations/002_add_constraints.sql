-- Migration 002: Add Data Validation Constraints
-- Created: 2026-03-13
-- Purpose: Ensure data integrity with CHECK constraints

-- Note: SQLite doesn't support adding constraints to existing tables
-- This migration creates new tables with constraints and migrates data

-- Step 1: Create new products table with constraints
CREATE TABLE IF NOT EXISTS products_new (
    id INTEGER PRIMARY KEY,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    name TEXT NOT NULL CHECK(length(trim(name)) > 0),
    brand TEXT NOT NULL CHECK(length(trim(brand)) > 0),
    quantity INTEGER DEFAULT 0 CHECK(quantity >= 0),
    min_quantity INTEGER DEFAULT 0 CHECK(min_quantity >= 0),
    description TEXT,
    sales_process TEXT,
    image_url TEXT,
    part_number TEXT,
    location TEXT DEFAULT '1',
    category TEXT DEFAULT 'Import',
    cost_price REAL DEFAULT 0 CHECK(cost_price >= 0),
    maker TEXT,
    equipment TEXT,
    pallet TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'available' CHECK(status IN ('available', 'transit', 'stockout_pending', 'stockout_done', 'reserved', 'damaged')),
    box TEXT,
    is_deleted INTEGER DEFAULT 0 CHECK(is_deleted IN (0, 1)),
    order_to TEXT,
    order_date TEXT,
    ship_plant TEXT,
    delivery_time TEXT,
    local_price REAL DEFAULT 0 CHECK(local_price >= 0),
    author TEXT,
    batch_id TEXT
);

-- Step 2: Migrate data from old table
INSERT INTO products_new SELECT * FROM products;

-- Step 3: Drop old table and rename new one
DROP TABLE products;
ALTER TABLE products_new RENAME TO products;

-- Step 4: Create new logistics_items table with constraints
CREATE TABLE IF NOT EXISTS logistics_items_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sales_process TEXT NOT NULL,
    part_number TEXT,
    description TEXT,
    quantity INTEGER DEFAULT 1 CHECK(quantity > 0),
    status TEXT DEFAULT 'received' CHECK(status IN ('received', 'shipped', 'delivered')),
    received_at TEXT DEFAULT CURRENT_TIMESTAMP,
    shipped_at TEXT,
    shipped_by TEXT,
    shipment_id TEXT,
    carrier TEXT,
    box_dimensions TEXT,
    box_image_url TEXT,
    urgency_level TEXT DEFAULT 'normal' CHECK(urgency_level IN ('low', 'normal', 'high', 'urgent')),
    notes TEXT,
    is_deleted INTEGER DEFAULT 0 CHECK(is_deleted IN (0, 1)),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Migrate logistics data
INSERT INTO logistics_items_new SELECT * FROM logistics_items;
DROP TABLE logistics_items;
ALTER TABLE logistics_items_new RENAME TO logistics_items;

-- Step 5: Create new movements table with constraints
CREATE TABLE IF NOT EXISTS movements_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('in', 'out', 'adjustment', 'transfer')),
    quantity INTEGER NOT NULL CHECK(quantity != 0),
    reason TEXT,
    unit_price REAL CHECK(unit_price >= 0),
    supplier TEXT,
    po_number TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Migrate movements data
INSERT INTO movements_new SELECT * FROM movements;
DROP TABLE movements;
ALTER TABLE movements_new RENAME TO movements;

-- Step 6: Create new app_users table with constraints
CREATE TABLE IF NOT EXISTS app_users_new (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL CHECK(length(trim(username)) >= 3),
    password TEXT NOT NULL CHECK(length(password) >= 8),
    role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user', 'viewer')),
    can_read INTEGER DEFAULT 1 CHECK(can_read IN (0, 1)),
    can_create INTEGER DEFAULT 0 CHECK(can_create IN (0, 1)),
    can_update INTEGER DEFAULT 0 CHECK(can_update IN (0, 1)),
    can_delete INTEGER DEFAULT 0 CHECK(can_delete IN (0, 1)),
    view_dashboard INTEGER DEFAULT 1 CHECK(view_dashboard IN (0, 1)),
    view_inventory INTEGER DEFAULT 1 CHECK(view_inventory IN (0, 1)),
    view_history INTEGER DEFAULT 1 CHECK(view_history IN (0, 1)),
    view_transit INTEGER DEFAULT 1 CHECK(view_transit IN (0, 1)),
    view_admin INTEGER DEFAULT 0 CHECK(view_admin IN (0, 1)),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    can_view_prices INTEGER DEFAULT 0 CHECK(can_view_prices IN (0, 1)),
    inventory_access TEXT DEFAULT 'read' CHECK(inventory_access IN ('none', 'read', 'write')),
    logistics_access TEXT DEFAULT 'read' CHECK(logistics_access IN ('none', 'read', 'write')),
    transit_access TEXT DEFAULT 'read' CHECK(transit_access IN ('none', 'read', 'write')),
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    view_logistics INTEGER DEFAULT 1 CHECK(view_logistics IN (0, 1)),
    view_settings INTEGER DEFAULT 1 CHECK(view_settings IN (0, 1)),
    history_access TEXT DEFAULT 'none' CHECK(history_access IN ('none', 'read', 'write')),
    dashboard_access TEXT DEFAULT 'none' CHECK(dashboard_access IN ('none', 'read', 'write')),
    settings_access TEXT DEFAULT 'none' CHECK(settings_access IN ('none', 'read', 'write')),
    admin_access TEXT DEFAULT 'none' CHECK(admin_access IN ('none', 'read', 'write')),
    backups_access TEXT DEFAULT 'none' CHECK(backups_access IN ('none', 'read', 'write')),
    usage_access TEXT DEFAULT 'none' CHECK(usage_access IN ('none', 'read', 'write')),
    view_backups INTEGER DEFAULT 1 CHECK(view_backups IN (0, 1)),
    view_usage INTEGER DEFAULT 0 CHECK(view_usage IN (0, 1)),
    view_stock_out INTEGER DEFAULT 0 CHECK(view_stock_out IN (0, 1)),
    stock_out_access TEXT DEFAULT 'none' CHECK(stock_out_access IN ('none', 'read', 'write'))
);

-- Migrate users data
INSERT INTO app_users_new SELECT * FROM app_users;
DROP TABLE app_users;
ALTER TABLE app_users_new RENAME TO app_users;
