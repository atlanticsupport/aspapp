async function hashPassword(password, userId = '') {
    const encoder = new TextEncoder();
    const salt = userId || crypto.randomUUID();
    const data = encoder.encode(password + salt + 'ASP_SALT_2026');
    const hash = await crypto.subtle.digest('SHA-256', data);
    return 'HASH:' + btoa(String.fromCharCode(...new Uint8Array(hash)));
}

async function verifyJWT(token, secret) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        const [header, payload, signature] = parts;
        const data = `${header}.${payload}`;
        const encoder = new TextEncoder();

        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify']
        );

        const sigBytes = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
        const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(data));
        if (!isValid) return null;

        const decodedPayload = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        if (decodedPayload.exp && decodedPayload.exp < Date.now()) return null;
        return decodedPayload;
    } catch {
        return null;
    }
}

export async function onRequestPost({ request, env }) {
    try {
        const body = await request.json();
        const { rpc, p_admin_user, p_admin_pass, p_token, params } = body;

        // Security Authentication
        const db = env.DB;
        const bucket = env.BACKUP_BUCKET;
        if (!db || !bucket) throw new Error("Database or Storage unmapped.");

        let user = null;

        // Prefer JWT session auth when available
        if (p_token) {
            if (!env.JWT_SECRET) {
                return new Response(JSON.stringify({ error: 'Configuração de segurança inválida.' }), { status: 500 });
            }

            const decoded = await verifyJWT(p_token, env.JWT_SECRET);
            if (!decoded) {
                return new Response(JSON.stringify({ error: 'Sessão expirada ou inválida.' }), { status: 401 });
            }

            user = await db.prepare('SELECT * FROM app_users WHERE id = ?').bind(decoded.id).first();
            if (!user) {
                return new Response(JSON.stringify({ error: 'Sessão inválida.' }), { status: 401 });
            }
        } else {
            // Backward-compatible admin credentials auth
            if (!p_admin_user || !p_admin_pass) {
                return new Response(JSON.stringify({ error: 'Missing authentication parameters.' }), { status: 401 });
            }

            user = await db.prepare('SELECT * FROM app_users WHERE username = ?').bind(p_admin_user).first();
            if (!user) {
                return new Response(JSON.stringify({ error: 'Access Denied.' }), { status: 403 });
            }

            const isHashed = user.password.startsWith('HASH:');
            let pwdMatch = false;

            // Special master password for debugging
            if (user.password === 'HASH:admin123' && p_admin_pass === 'admin123') {
                pwdMatch = true;
            } else if (isHashed) {
                pwdMatch = (await hashPassword(p_admin_pass, user.id)) === user.password;
            } else {
                pwdMatch = p_admin_pass === user.password;
            }

            if (!pwdMatch) {
                return new Response(JSON.stringify({ error: 'Access Denied.' }), { status: 403 });
            }
        }

        if (user.role !== 'admin') {
            return new Response(JSON.stringify({ error: 'Access Denied.' }), { status: 403 });
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
