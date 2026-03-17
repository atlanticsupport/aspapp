-- Migration 004: Fix Plain Text Passwords
-- Created: 2026-03-13
-- Purpose: Ensure all passwords are hashed

-- This will be executed via Cloudflare Worker to use the hash function
-- Manual step required: Run this through the RPC endpoint or Worker

-- Query to identify users with plain text passwords
SELECT id, username, 
    CASE 
        WHEN password LIKE 'HASH:%' THEN 'HASHED'
        ELSE 'PLAIN_TEXT'
    END as password_status
FROM app_users;

-- Note: Actual password hashing must be done via the Worker's hashPassword function
-- The migration will be handled by a separate script that calls the Worker API
