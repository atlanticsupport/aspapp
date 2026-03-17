// Temporary endpoint to sync users - Execute migration 008
// This will reset app_users table and create clean admin user

export async function onRequestPost({ request, env }) {
    try {
        const db = env.DB;
        if (!db) throw new Error("Database binding 'DB' not found.");

        // Execute migration 008 - Sync Real Users
        const migration = `
            -- Clear existing users to start fresh
            DELETE FROM app_users;

            -- Create single admin user with FULL global permissions
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
                1, 1, 1, 1,
                1, 1, 1, 1, 1,
                1,
                'RCUD', 'RCUD', 'RCUD',
                1, 1,
                'RCUD', 'RCUD', 'RCUD', 'RCUD', 'RCUD', 'RCUD',
                1, 1, 1,
                'RCUD',
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            );
        `;

        // Split and execute statements
        const statements = migration
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const stmt of statements) {
            await db.prepare(stmt).run();
        }

        // Verify user created
        const { results } = await db.prepare("SELECT username, role FROM app_users WHERE username = 'admin'").all();

        return new Response(JSON.stringify({
            success: true,
            message: 'User sync complete! Old users deleted, admin user created.',
            users: results,
            credentials: {
                username: 'admin',
                password: 'admin',
                note: 'Please change password after login'
            }
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        console.error("User Sync Error:", err);
        return new Response(JSON.stringify({
            error: err.message,
            stack: err.stack
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
