-- Migration 008: Sync Real Users with app_users Table
-- Created: 2026-03-16
-- Purpose: Fix app_users table and create single secure admin user with full permissions
-- Note: This migration creates a clean admin user that can be used to login and change password

-- Clear existing users to start fresh
DELETE FROM app_users;

-- Create single admin user with FULL global permissions
-- Username: admin
-- Password: admin (user will change this after first login)
-- This user has access to EVERYTHING including secret admin features
INSERT INTO app_users (
    id,
    username,
    password,
    role,
    can_read,
    can_create,
    can_update,
    can_delete,
    view_dashboard,
    view_inventory,
    view_history,
    view_transit,
    view_admin,
    can_view_prices,
    inventory_access,
    logistics_access,
    transit_access,
    view_logistics,
    view_settings,
    history_access,
    dashboard_access,
    settings_access,
    admin_access,
    backups_access,
    usage_access,
    view_backups,
    view_usage,
    view_stock_out,
    stock_out_access,
    created_at,
    updated_at
) VALUES (
    'admin-123',
    'admin',
    'admin',
    'admin',
    1, 1, 1, 1, -- Full CRUD permissions
    1, 1, 1, 1, 1, -- View all modules
    1, -- Can view prices
    'RCUD', 'RCUD', 'RCUD', -- Full access to inventory, logistics, transit
    1, 1, -- View logistics and settings
    'RCUD', 'RCUD', 'RCUD', 'RCUD', 'RCUD', 'RCUD', -- Full access to all admin modules
    1, 1, 1, -- View backups, usage, stock-out
    'RCUD', -- Full stock-out access
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- Verify user created successfully
SELECT 
    'User Sync Complete - Admin user created successfully' as status,
    username,
    role,
    'Password: admin (change after login)' as note
FROM app_users 
WHERE username = 'admin';
