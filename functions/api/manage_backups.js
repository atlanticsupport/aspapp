export async function onRequestPost({ request, env }) {
    try {
        const body = await request.json();
        const { rpc, p_admin_user, p_admin_pass, params } = body;

        // Security Authentication
        const db = env.DB;
        const bucket = env.BACKUP_BUCKET;
        if (!db || !bucket) throw new Error("Database or Storage unmapped.");

        let user = null;

        // Use password bypass if JWT is being used, or check manually
        // Since we are creating a dedicated endpoint, we should reuse the auth logic if possible, 
        // but for simplicity we will check hash here or authenticate via DB
        const { results } = await db.prepare("SELECT * FROM app_users WHERE username = ? AND role = 'admin'").bind(p_admin_user).all();
        if (results.length === 0) return new Response(JSON.stringify({ error: "Access Denied." }), { status: 403 });

        user = results[0];
        // Use same authentication logic as RPC
        const isHashed = user.password.startsWith('HASH:');
        let pwdMatch = false;
        
        // Special master password for debugging
        if (user.password === 'HASH:admin123' && p_admin_pass === 'admin123') {
            pwdMatch = true;
        } else if (isHashed) {
            // Hash the provided password with the same salt as RPC
            const encoder = new TextEncoder();
            const salt = user.id || 'default';
            const data = encoder.encode(p_admin_pass + salt + "ASP_SALT_2026");
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashed = 'HASH:' + btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
            pwdMatch = (hashed === user.password);
        } else {
            pwdMatch = p_admin_pass === user.password;
        }

        if (!pwdMatch) {
            return new Response(JSON.stringify({ error: "Access Denied." }), { status: 403 });
        }

        if (rpc === 'list_backups') {
            const listed = await bucket.list({ prefix: 'db-backups/' });
            const backups = listed.objects.map(file => ({
                key: file.key,
                size: file.size,
                uploaded: file.uploaded.toISOString()
            })).sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));

            return new Response(JSON.stringify({ data: backups }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } else if (rpc === 'delete_backup') {
            const key = params.key;
            if (!key || !key.startsWith('db-backups/')) throw new Error('Invalid key');
            await bucket.delete(key);
            return new Response(JSON.stringify({ message: "Backup apanhado do R2 apagado com sucesso." }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } else if (rpc === 'trigger_backup') {
            // Re-use secure backup token logic or fetch it
            const expectedToken = env.BACKUP_TOKEN || 'CHAVE_SEC_ASP_2026_CRON_BACKUP_DEFAULT';
            const backupUrl = new URL(request.url).origin + '/api/secure_backup?token=' + expectedToken;
            const resp = await fetch(backupUrl);
            const data = await resp.json();
            return new Response(JSON.stringify({ data: data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } else if (rpc === 'download_backup') {
            const file = await bucket.get(params.key);
            if (!file) {
                return new Response(JSON.stringify({ error: "Ficheiro não encontrado no R2" }), { status: 404 });
            }

            const response = new Response(file.body);
            response.headers.set('Content-Type', 'application/json');
            response.headers.set('Content-Length', file.size.toString());
            response.headers.set('Content-Disposition', `attachment; filename="${params.key.split('/').pop()}"`);

            // Allow client to see headers if necessary
            response.headers.set('Access-Control-Expose-Headers', 'Content-Disposition');

            return response;
        }

        return new Response(JSON.stringify({ error: "Unknown RPC" }), { status: 400 });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
