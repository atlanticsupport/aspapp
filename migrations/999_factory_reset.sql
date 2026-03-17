-- Factory Reset Migration - DELETES ALL DATA
-- WARNING: This will permanently delete ALL data in the database
-- Created: 2026-03-13
-- Purpose: Complete database reset for testing/factory reset scenarios

-- Disable foreign key constraints temporarily
PRAGMA foreign_keys = OFF;

-- Clear all tables in order of dependencies
DELETE FROM import_items;
DELETE FROM import_history;
DELETE FROM attachments;
DELETE FROM movements;
DELETE FROM logistics_items;
DELETE FROM products;
DELETE FROM historico_geral;
DELETE FROM app_events;
DELETE FROM phc;
DELETE FROM app_users;

-- Reset auto-increment sequences (SQLite specific)
DELETE FROM sqlite_sequence WHERE name IN (
    'import_items',
    'import_history', 
    'attachments',
    'movements',
    'logistics_items',
    'products',
    'historico_geral',
    'app_events',
    'phc',
    'app_users'
);

-- Re-enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Create default admin user
INSERT INTO app_users (
    id, 
    username, 
    password, 
    role, 
    inventory_access, 
    logistics_access, 
    transit_access, 
    can_delete, 
    can_write, 
    can_read, 
    can_view_prices, 
    view_history, 
    created_at
) VALUES (
    'admin',
    'admin',
    'HASH:2KqO6p7K8xJ5k3m1L9rT5wH2nF8cV4bX0zA9sP3dQ6yE1tR7uI4oZ5gH2jN8lM0',
    'admin',
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    CURRENT_TIMESTAMP
);

-- Verify reset
SELECT 'Factory Reset Complete - All data deleted' as status;
