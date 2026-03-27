async function verifyAdmin(db, p_admin_user, p_admin_pass) {
    if (!p_admin_user || !p_admin_pass) return false;
    const user = await db.prepare('SELECT * FROM app_users WHERE username = ?').bind(p_admin_user).first();
    if (!user) return false;
    if (user.password === p_admin_pass) return true;
    // support HASH: entries
    if (user.password && user.password.startsWith('HASH:')) {
        const encoder = new TextEncoder();
        const salt = user.id || '';
        const data = encoder.encode(p_admin_pass + salt + 'ASP_SALT_2026');
        const hash = await crypto.subtle.digest('SHA-256', data);
        const candidate = 'HASH:' + btoa(String.fromCharCode(...new Uint8Array(hash)));
        return candidate === user.password;
    }
    return false;
}

export async function onRequestPost({ request, env }) {
    try {
        const body = await request.json();
        const { key, p_admin_user, p_admin_pass } = body;
        if (!key) return new Response(JSON.stringify({ error: 'Missing key' }), { status: 400 });

        const db = env.DB;
        if (!db) return new Response(JSON.stringify({ error: 'DB not configured' }), { status: 500 });

        const ok = await verifyAdmin(db, p_admin_user, p_admin_pass);
        if (!ok) return new Response(JSON.stringify({ error: 'Access denied' }), { status: 403 });

        const bucket = env.BACKUP_BUCKET;
        if (!bucket) return new Response(JSON.stringify({ error: 'Bucket not configured' }), { status: 500 });

        await bucket.delete(key);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
