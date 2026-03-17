// Factory Reset API Endpoint
// WARNING: This will permanently delete ALL data in the database

export async function onRequestPost(context) {
    const { request, env } = context;
    
    // Only allow admin users
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    const token = authHeader.substring(7);
    const user = await verifyJWT(token, env.JWT_SECRET);
    
    if (!user || user.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Access denied. Admin only.' }), { 
            status: 403,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    // Additional confirmation check
    const body = await request.json().catch(() => ({}));
    if (body.confirm !== 'FACTORY_RESET_ALL_DATA') {
        return new Response(JSON.stringify({ 
            error: 'Confirmation required. Send { "confirm": "FACTORY_RESET_ALL_DATA" }' 
        }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    try {
        const db = env.DB;
        
        // Disable foreign keys
        await db.exec('PRAGMA foreign_keys = OFF');
        
        // Delete all data
        const tables = [
            'import_items',
            'import_history',
            'attachments', 
            'movements',
            'logistics_items',
            'products',
            'historico_geral',
            'app_events',
            'app_users'
        ];
        
        // Note: PHC table is preserved during factory reset
        
        for (const table of tables) {
            await db.prepare(`DELETE FROM ${table}`).run();
        }
        
        // Reset sequences
        await db.prepare(`
            DELETE FROM sqlite_sequence 
            WHERE name IN (${tables.map(() => '?').join(',')})
        `).bind(...tables).run();
        
        // Re-enable foreign keys
        await db.exec('PRAGMA foreign_keys = ON');
        
        // Create default admin user
        const defaultAdminId = crypto.randomUUID();
        const defaultPassword = await hashPassword('admin', defaultAdminId);
        
        await db.prepare(`
            INSERT INTO app_users (
                id, username, password, role, 
                inventory_access, logistics_access, transit_access,
                can_delete, can_write, can_read, can_view_prices, view_history,
                created_at
            ) VALUES (?, ?, ?, ?, 1, 1, 1, 1, 1, 1, 1, 1, ?)
        `).bind(
            defaultAdminId,
            'admin',
            defaultPassword,
            'admin',
            new Date().toISOString()
        ).run();
        
        // Clear any backup data in R2 if needed
        if (env.BACKUP_BUCKET) {
            try {
                const objects = await env.BACKUP_BUCKET.list();
                for (const object of objects.objects) {
                    await env.BACKUP_BUCKET.delete(object.key);
                }
            } catch (error) {
                console.error('Failed to clear R2 bucket:', error);
            }
        }
        
        return new Response(JSON.stringify({ 
            success: true,
            message: 'Factory reset completed. All data has been deleted.',
            default_admin: {
                username: 'admin',
                password: 'admin'
            }
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
        
    } catch (error) {
        console.error('Factory reset error:', error);
        return new Response(JSON.stringify({ 
            error: 'Failed to reset database',
            details: error.message 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

async function verifyJWT(token, secret) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        
        const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        
        // Verify signature (simplified for factory reset)
        const encoder = new TextEncoder();
        const data = `${parts[0]}.${parts[1]}`;
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify']
        );
        
        const signature = new Uint8Array(
            atob(parts[2].replace(/-/g, '+').replace(/_/g, '/'))
                .split('')
                .map(c => c.charCodeAt(0))
        );
        
        const isValid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(data));
        
        return isValid ? payload : null;
    } catch {
        return null;
    }
}

async function hashPassword(password, userId = '') {
    const encoder = new TextEncoder();
    const salt = userId || crypto.randomUUID();
    const data = encoder.encode(password + salt + "ASP_SALT_2026");
    const hash = await crypto.subtle.digest('SHA-256', data);
    return 'HASH:' + btoa(String.fromCharCode(...new Uint8Array(hash)));
}

export async function onRequest(context) {
    if (context.request.method === 'POST') {
        return onRequestPost(context);
    }
    return new Response('Method not allowed', { status: 405 });
}
