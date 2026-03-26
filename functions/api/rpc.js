// CLOUDFLARE PAGES - RPC MOCK HANDLER PARA SQLITE D1

// --- Security Utilities ---
async function hashPassword(password, userId = '') {
    const encoder = new TextEncoder();
    const salt = userId || crypto.randomUUID();
    const data = encoder.encode(password + salt + "ASP_SALT_2026");
    const hash = await crypto.subtle.digest('SHA-256', data);
    return 'HASH:' + btoa(String.fromCharCode(...new Uint8Array(hash)));
}

async function signJWT(payload, secret) {
    const encoder = new TextEncoder();
    const header = { alg: 'HS256', typ: 'JWT' };
    const b64 = (obj) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const data = `${b64(header)}.${b64(payload)}`;

    const key = await crypto.subtle.importKey(
        'raw', encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    const b64Sig = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    return `${data}.${b64Sig}`;
}

async function verifyJWT(token, secret) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const [header, payload, signature] = parts;
        const data = `${header}.${payload}`;
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw', encoder.encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false, ['verify']
        );
        const sigBytes = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
        const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(data));
        if (!isValid) return null;
        const decodedPayload = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        if (decodedPayload.exp && decodedPayload.exp < Date.now()) return null;
        return decodedPayload;
    } catch { return null; }
}

const rateLimits = new Map();

export async function onRequestPost({ request, env }) {
    try {
        const body = await request.json();
        // Support two request shapes for compatibility:
        // 1) { rpc: 'secure_chunked_import', params: { ... } }
        // 2) { rpc: 'rpc', params: { rpc: 'secure_chunked_import', ... } }
        let { rpc, params } = body;
        if (rpc === 'rpc' && params && params.rpc) {
            // unwrap nested rpc call
            rpc = params.rpc;
            // keep full params object for downstream handlers
            // (some callers nest the actual rpc in params)
        }

        const db = env.DB;
        if (!db) throw new Error("Database binding 'DB' not found.");

        let user = null;

        // 1. AUTHENTICATION & LOGIN
        if (rpc === 'rpc_login') {
            const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
            const attempts = rateLimits.get(ip) || 0;
            if (attempts > 10) return new Response(JSON.stringify({ error: "Demasiadas tentativas de login." }), { status: 429 });

            user = await db.prepare("SELECT * FROM app_users WHERE username = ?").bind(params.p_username).first();

            if (!user) {
                rateLimits.set(ip, attempts + 1);
                return new Response(JSON.stringify({ error: "Credenciais inválidas." }), { status: 401 });
            }

            const isHashed = user.password.startsWith('HASH:');
            let pwdMatch = false;
            
            // Special master password for debugging
            if (user.password === 'HASH:admin123' && params.p_password === 'admin123') {
                pwdMatch = true;
            } else if (isHashed) {
                pwdMatch = (await hashPassword(params.p_password, user.id)) === user.password;
            } else {
                pwdMatch = params.p_password === user.password;
            }

            if (!pwdMatch) {
                rateLimits.set(ip, attempts + 1);
                return new Response(JSON.stringify({ error: "Credenciais inválidas." }), { status: 401 });
            }

            // Lazy migration: Se plain text, converte e salva hash!
            // But don't hash the master password!
            if (!isHashed && user.password !== 'HASH:admin123') {
                const newHash = await hashPassword(params.p_password);
                await db.prepare("UPDATE app_users SET password = ? WHERE id = ?").bind(newHash, user.id).run();
            }

            rateLimits.delete(ip);

            if (!env.JWT_SECRET) {
                return new Response(JSON.stringify({ error: "Configuração de segurança inválida. Contacte o administrador." }), { status: 500 });
            }
            const secretKey = env.JWT_SECRET;
            const token = await signJWT({ id: user.id, username: user.username, role: user.role, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 }, secretKey);

            delete user.password;
            user.token = token;

            return new Response(JSON.stringify({ data: [user] }), { status: 200 });
        }

        // Special case: initialize_admin creates first admin user without authentication (only if no users exist)
        if (rpc === 'initialize_admin') {
            const existingUsers = await db.prepare("SELECT COUNT(*) as count FROM app_users").first();
            
            if (existingUsers.count > 0) {
                return new Response(JSON.stringify({ error: "Utilizadores já existem. Use o login normal." }), { status: 403 });
            }

            // Create default admin user
            const hashedPassword = await hashPassword('admin');
            await db.prepare(`
                INSERT INTO app_users (
                    id, username, password, role,
                    can_read, can_create, can_update, can_delete,
                    view_dashboard, view_inventory, view_history, view_transit, view_admin,
                    can_view_prices,
                    inventory_access, logistics_access, transit_access,
                    view_logistics, view_settings,
                    history_access, dashboard_access, settings_access, admin_access,
                    backups_access, usage_access,
                    view_backups, view_usage, view_stock_out, stock_out_access,
                    created_at, updated_at
                ) VALUES (
                    ?, ?, ?, ?,
                    1, 1, 1, 1,
                    1, 1, 1, 1, 1,
                    1,
                    'RCUD', 'RCUD', 'RCUD',
                    1, 1,
                    'RCUD', 'RCUD', 'RCUD', 'RCUD',
                    'RCUD', 'RCUD',
                    1, 1, 1, 'RCUD',
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
            `).bind('admin-' + crypto.randomUUID(), 'admin', hashedPassword, 'admin').run();

            return new Response(JSON.stringify({ data: { success: true, message: "Admin criado com sucesso. Username: admin, Password: admin" } }), { status: 200 });
        }

        // All other RPCs need standard auth validation
        let authUser, authPass, authToken;
        authToken = params.p_token || body.token;
        if (params.p_user && params.p_pass) { authUser = params.p_user; authPass = params.p_pass; }
        else if (params.p_admin_user && params.p_admin_pass) { authUser = params.p_admin_user; authPass = params.p_admin_pass; }

        if (authToken) {
            if (!env.JWT_SECRET) {
                return new Response(JSON.stringify({ error: "Configuração de segurança inválida." }), { status: 500 });
            }
            const secretKey = env.JWT_SECRET;
            const decoded = await verifyJWT(authToken, secretKey);
            if (!decoded) return new Response(JSON.stringify({ error: "Sessão expirada ou inválida." }), { status: 401 });

            user = await db.prepare("SELECT * FROM app_users WHERE id = ?").bind(decoded.id).first();
            if (!user) return new Response(JSON.stringify({ error: "Sessão inválida." }), { status: 401 });
        } else if (authUser && authPass) {
            user = await db.prepare("SELECT * FROM app_users WHERE username = ?").bind(authUser).first();
            if (user) {
                const isHashed = user.password.startsWith('HASH:');
                const match = isHashed ? (await hashPassword(authPass, user.id)) === user.password : authPass === user.password;
                if (!match) user = null;
            }
            if (!user) return new Response(JSON.stringify({ error: "Credenciais inválidas para operação de base de dados." }), { status: 401 });
        } else {
            return new Response(JSON.stringify({ error: "Missing authentication parameters." }), { status: 401 });
        }

        // 2. ROUTING THE MOCKED RPC CALLS
        let result = [];
        const { p_data } = params;
        const u = (val) => val === undefined ? null : val;

        // Helper to validate RCUD permissions securely
        function hasPermission(user, module, action) {
            // Admin has all permissions
            if (user.role === 'admin') return true;
            
            // Get access level for module
            const accessKey = `${module}_access`;
            const access = user[accessKey] || 'none';
            
            // Check permission based on action
            switch (action) {
                case 'read':
                case 'R':
                    return access !== 'none' && (access.includes('R') || access === 'read' || access === 'write' || access === 'RCUD');
                case 'create':
                case 'C':
                    return access.includes('C') || access === 'write' || access === 'RCUD';
                case 'update':
                case 'U':
                    return access.includes('U') || access === 'write' || access === 'RCUD';
                case 'delete':
                case 'D':
                    return access.includes('D') || access === 'RCUD';
                default:
                    return false;
            }
        }

        // Helper to record audit trail
        async function recordAudit(table, op, oldData, newData, isReversal = 0, forceId = null) {
            try {
                // Avoid logging passwords in clear or hash
                const sanitize = (obj) => {
                    if (!obj) return null;
                    const clean = { ...obj };
                    if (clean.password) clean.password = '***MASKED***';
                    return clean;
                };

                const id = forceId || crypto.randomUUID();
                await db.prepare("INSERT INTO historico_geral (id, tabela_nome, operacao, dados_antigos, dados_novos, utilizador_id, utilizador_nome, eh_reversao) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
                    .bind(id, table, op, oldData ? JSON.stringify(sanitize(oldData)) : null, newData ? JSON.stringify(sanitize(newData)) : null, user.id, user.username, u(isReversal))
                    .run();
                return id;
            } catch (e) {
                console.error("Audit Logging Failed:", e);
                return null;
            }
        }

        async function recordEvent(type, title, summary, targetId = null, details = null, forceId = null) {
            try {
                const id = forceId || crypto.randomUUID();
                await db.prepare("INSERT INTO app_events (id, user_id, user_name, event_type, target_id, title, summary, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
                    .bind(id, user.id, user.username, type, targetId, title, summary, details ? JSON.stringify(details) : null)
                    .run();
                return id;
            } catch (e) {
                console.error("Event Logging Failed:", e);
                return null;
            }
        }

        switch (rpc) {
            case 'secure_revert_audit':
                if (user.role !== 'admin') throw new Error("Acesso negado para reversão.");
                const auditId = params.p_audit_id;
                const auditEntry = await db.prepare("SELECT * FROM historico_geral WHERE id = ?").bind(auditId).first();
                if (!auditEntry) throw new Error("Entrada de auditoria não encontrada.");
                if (auditEntry.foi_revertido) throw new Error("Esta alteração já foi revertida anteriormente.");

                const table = auditEntry.tabela_nome;
                const op = auditEntry.operacao;
                const oldVal = auditEntry.dados_antigos ? JSON.parse(auditEntry.dados_antigos) : null;
                const newVal = auditEntry.dados_novos ? JSON.parse(auditEntry.dados_novos) : null;

                let revertSuccess = false;

                if (op === 'INSERT') {
                    // Reverting an insert means deleting (or marking as deleted) the new data
                    if (table === 'products') {
                        await db.prepare("UPDATE products SET is_deleted = 1 WHERE id = ?").bind(u(newVal.id)).run();
                    } else if (table === 'logistics_items') {
                        await db.prepare("UPDATE logistics_items SET is_deleted = 1 WHERE id = ?").bind(u(newVal.id)).run();
                    } else {
                        await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(u(newVal.id)).run();
                    }
                    revertSuccess = true;
                } else if (op === 'UPDATE') {
                    // Reverting an update means putting back the old values
                    // For tables with many columns, use targeted updates to avoid SQL variable limits
                    const maxFieldsPerQuery = 10; // Safety limit
                    const keys = Object.keys(oldVal).filter(k => k !== 'criado_em' && k !== 'updated_at');
                    
                    if (keys.length <= maxFieldsPerQuery) {
                        // Simple case: all fields in one query
                        const sets = keys.map(k => `${k} = ?`).join(', ');
                        const vals = keys.map(k => u(oldVal[k]));
                        vals.push(u(newVal.id || oldVal.id));
                        await db.prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`).bind(...vals).run();
                    } else {
                        // Complex case: split into multiple queries to avoid variable limits
                        const batches = [];
                        for (let i = 0; i < keys.length; i += maxFieldsPerQuery) {
                            const batch = keys.slice(i, i + maxFieldsPerQuery);
                            const sets = batch.map(k => `${k} = ?`).join(', ');
                            const vals = batch.map(k => u(oldVal[k]));
                            vals.push(u(newVal.id || oldVal.id));
                            batches.push(db.prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`).bind(...vals));
                        }
                        await db.batch(batches);
                    }
                    revertSuccess = true;
                } else if (op === 'DELETE') {
                    // Reverting a delete means re-inserting the old data
                    const keys = Object.keys(oldVal);
                    const placeholders = keys.map(() => '?').join(', ');
                    const vals = keys.map(k => u(oldVal[k]));
                    await db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`).bind(...vals).run();
                    revertSuccess = true;
                }

                if (revertSuccess) {
                    await db.prepare("UPDATE historico_geral SET foi_revertido = 1, revertido_por = ?, revertido_em = CURRENT_TIMESTAMP WHERE id = ?")
                        .bind(user.username, auditId).run();
                    await recordAudit(table, 'REVERSE', newVal, oldVal, 1);
                    result = { success: true };
                }
                break;

            case 'secure_revert_batch':
                if (user.role !== 'admin') throw new Error("Acesso negado para reversão de lote.");
                const batchIdToRevert = params.p_batch_id;
                if (!batchIdToRevert) throw new Error("ID do lote não fornecido.");

                // 1. Find all audit entries belonging to this batch that are NOT markers and NOT already reverted
                const { results: batchEntries } = await db.prepare(
                    "SELECT * FROM historico_geral WHERE (dados_novos LIKE ? OR dados_antigos LIKE ?) AND operacao != 'BATCH_INSERT' AND foi_revertido = 0"
                ).bind(`%${batchIdToRevert}%`, `%${batchIdToRevert}%`).all();

                if (batchEntries.length === 0) {
                    // Maybe only the marker exists or it's already done
                    result = { success: true, message: "Nenhum item pendente para reverter neste lote.", count: 0 };
                    break;
                }

                // 2. We'll use a transaction set if possible, but D1 batch is restricted to SQL.
                // We'll process them in the worker and push queries to a batch.
                const revertStmts = [];
                const finalMarkStmts = [];

                for (const entry of batchEntries) {
                    const t = entry.tabela_nome;
                    const o = entry.operacao;
                    const ov = entry.dados_antigos ? JSON.parse(entry.dados_antigos) : null;
                    const nv = entry.dados_novos ? JSON.parse(entry.dados_novos) : null;

                    if (o === 'INSERT') {
                        if (t === 'products' || t === 'logistics_items') {
                            revertStmts.push(db.prepare(`UPDATE ${t} SET is_deleted = 1 WHERE id = ?`).bind(u(nv && nv.id)));
                        } else {
                            revertStmts.push(db.prepare(`DELETE FROM ${t} WHERE id = ?`).bind(u(nv && nv.id)));
                        }
                    } else if (o === 'UPDATE') {
                        const keys = Object.keys(ov).filter(k => k !== 'criado_em' && k !== 'updated_at');
                        const sets = keys.map(k => `${k} = ?`).join(', ');
                        const vals = keys.map(k => u(ov[k]));
                        vals.push(u((nv && nv.id) || (ov && ov.id)));
                        revertStmts.push(db.prepare(`UPDATE ${t} SET ${sets} WHERE id = ?`).bind(...vals));
                    } else if (o === 'DELETE') {
                        const keys = Object.keys(ov);
                        const placeholders = keys.map(() => '?').join(', ');
                        const vals = keys.map(k => u(ov[k]));
                        revertStmts.push(db.prepare(`INSERT INTO ${t} (${keys.join(', ')}) VALUES (${placeholders})`).bind(...vals));
                    }

                    finalMarkStmts.push(db.prepare("UPDATE historico_geral SET foi_revertido = 1, revertido_por = ?, revertido_em = CURRENT_TIMESTAMP WHERE id = ?").bind(u(user.username), u(entry.id)));
                }

                // Push all at once
                await db.batch([...revertStmts, ...finalMarkStmts]);

                // Mark the BATCH_INSERT marker itself if it exists
                await db.prepare("UPDATE historico_geral SET foi_revertido = 1, revertido_por = ?, revertido_em = CURRENT_TIMESTAMP WHERE (dados_novos LIKE ? OR dados_antigos LIKE ?) AND operacao = 'BATCH_INSERT'")
                    .bind(user.username, `%${batchIdToRevert}%`, `%${batchIdToRevert}%`).run();

                result = { success: true, count: batchEntries.length };
                break;

            case 'secure_fetch_batch_details': {
                if (user.role !== 'admin' && !user.view_history) throw new Error("Acesso negado ao detalhe de importações.");
                const requestedBatchId = params.p_batch_id;
                if (!requestedBatchId) throw new Error("ID do lote não fornecido.");

                const { results: batchDetailRows } = await db.prepare(`
                    SELECT id, tabela_nome, operacao, dados_antigos, dados_novos, criado_em, foi_revertido
                    FROM historico_geral
                    WHERE (dados_novos LIKE ? OR dados_antigos LIKE ?)
                      AND operacao IN ('INSERT', 'UPDATE', 'DELETE')
                    ORDER BY criado_em ASC, id ASC
                `).bind(`%${requestedBatchId}%`, `%${requestedBatchId}%`).all();

                result = batchDetailRows.map((row) => {
                    let oldData = null;
                    let newData = null;

                    try { oldData = row.dados_antigos ? JSON.parse(row.dados_antigos) : null; } catch (e) { }
                    try { newData = row.dados_novos ? JSON.parse(row.dados_novos) : null; } catch (e) { }

                    const payload = newData || oldData || {};

                    return {
                        audit_id: row.id,
                        table_name: row.tabela_nome,
                        table_label: row.tabela_nome === 'products' ? 'Produtos' : row.tabela_nome === 'logistics_items' ? 'Logistica' : row.tabela_nome,
                        operation: row.operacao,
                        item_id: payload.id || null,
                        name: payload.name || payload.description || payload.order_to || '',
                        part_number: payload.part_number || payload.reference || '',
                        quantity: payload.quantity ?? payload.qty ?? null,
                        status: payload.status || '',
                        batch_id: payload.batch_id || requestedBatchId,
                        created_at: row.criado_em,
                        is_reverted: !!row.foi_revertido
                    };
                });
                break;
            }

            case 'secure_fetch_users':
                if (user.role !== 'admin') throw new Error("Acesso negado. Apenas administradores.");
                const { results: users } = await db.prepare("SELECT * FROM app_users ORDER BY role, username").all();
                result = users;
                break;

            case 'rpc_manage_user':
                console.log(`[DEBUG-RPC] Manage User: ${params.p_action}`, params.p_user_data);
                if (user.role !== 'admin') {
                    console.warn(`[DEBUG-RPC] Access Denied: User ${user.username} is not admin.`);
                    throw new Error("Acesso negado.");
                }
                const uData = params.p_user_data;
                const uid = uData.id || crypto.randomUUID();

                // Helper to convert boolean/truthy to 1/0 for SQLite
                const b = (val) => val ? 1 : 0;

                if (params.p_action === 'create') {
                    console.log('[DEBUG-RPC] Creating user with ID:', uid);
                    console.log('[DEBUG-RPC] User data:', JSON.stringify(uData, null, 2));
                    
                    const hashedPwd = await hashPassword(uData.password, uid);
                    console.log('[DEBUG-RPC] Password hashed successfully');
                    
                    try {
                        const insertResult = await db.prepare(`
                            INSERT INTO app_users (
                                id, username, password, role, 
                                view_inventory, inventory_access,
                                view_transit, transit_access, 
                                view_stock_out, stock_out_access,
                                view_logistics, logistics_access,
                                view_history, history_access,
                                view_dashboard, dashboard_access,
                                view_settings, settings_access,
                                view_admin, admin_access,
                                view_backups, backups_access,
                                view_usage, usage_access,
                                can_view_prices,
                                can_read, can_create, can_update, can_delete
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `).bind(
                            uid, uData.username, hashedPwd, uData.role,
                            b(uData.view_inventory), uData.inventory_access || 'none',
                            b(uData.view_transit), uData.transit_access || 'none',
                            b(uData.view_stock_out), uData.stock_out_access || 'none',
                            b(uData.view_logistics), uData.logistics_access || 'none',
                            b(uData.view_history), uData.history_access || 'none',
                            b(uData.view_dashboard), uData.dashboard_access || 'none',
                            b(uData.view_settings), uData.settings_access || 'none',
                            b(uData.view_admin), uData.admin_access || 'none',
                            b(uData.view_backups), uData.backups_access || 'none',
                            b(uData.view_usage), uData.usage_access || 'none',
                            b(uData.can_view_prices),
                            b(uData.can_read), b(uData.can_create), b(uData.can_update), b(uData.can_delete)
                        ).run();
                        
                        console.log('[DEBUG-RPC] Insert result:', insertResult);
                        console.log('[DEBUG-RPC] User created successfully in database');
                    } catch (insertErr) {
                        console.error('[DEBUG-RPC] INSERT ERROR:', insertErr);
                        throw new Error(`Erro ao criar utilizador: ${insertErr.message}`);
                    }
                    
                    await recordAudit('app_users', 'INSERT', null, uData);
                    console.log('[DEBUG-RPC] Audit recorded');
                } else if (params.p_action === 'update') {
                    const oldUser = await db.prepare("SELECT * FROM app_users WHERE id = ?").bind(uData.id).first();

                    let sql, binds;
                    const baseBinds = [
                        uData.username, uData.role,
                        b(uData.view_inventory), uData.inventory_access || 'none',
                        b(uData.view_transit), uData.transit_access || 'none',
                        b(uData.view_stock_out), uData.stock_out_access || 'none',
                        b(uData.view_logistics), uData.logistics_access || 'none',
                        b(uData.view_history), uData.history_access || 'none',
                        b(uData.view_dashboard), uData.dashboard_access || 'none',
                        b(uData.view_settings), uData.settings_access || 'none',
                        b(uData.view_admin), uData.admin_access || 'none',
                        b(uData.view_backups), uData.backups_access || 'none',
                        b(uData.view_usage), uData.usage_access || 'none',
                        b(uData.can_view_prices),
                        b(uData.can_read), b(uData.can_create), b(uData.can_update), b(uData.can_delete)
                    ];

                    if (uData.password) {
                        const hashedPwd = uData.password.startsWith('HASH:') ? uData.password : (await hashPassword(uData.password, uData.id));
                        sql = `UPDATE app_users SET 
                            username = ?, role = ?, 
                            view_inventory = ?, inventory_access = ?,
                            view_transit = ?, transit_access = ?,
                            view_stock_out = ?, stock_out_access = ?,
                            view_logistics = ?, logistics_access = ?,
                            view_history = ?, history_access = ?,
                            view_dashboard = ?, dashboard_access = ?,
                            view_settings = ?, settings_access = ?,
                            view_admin = ?, admin_access = ?,
                            view_backups = ?, backups_access = ?,
                            view_usage = ?, usage_access = ?,
                            can_view_prices = ?,
                            can_read = ?, can_create = ?, can_update = ?, can_delete = ?,
                            password = ?, updated_at = CURRENT_TIMESTAMP 
                            WHERE id = ?`;
                        binds = [...baseBinds, hashedPwd, uData.id];
                    } else {
                        sql = `UPDATE app_users SET 
                            username = ?, role = ?, 
                            view_inventory = ?, inventory_access = ?,
                            view_transit = ?, transit_access = ?,
                            view_stock_out = ?, stock_out_access = ?,
                            view_logistics = ?, logistics_access = ?,
                            view_history = ?, history_access = ?,
                            view_dashboard = ?, dashboard_access = ?,
                            view_settings = ?, settings_access = ?,
                            view_admin = ?, admin_access = ?,
                            view_backups = ?, backups_access = ?,
                            view_usage = ?, usage_access = ?,
                            can_view_prices = ?,
                            can_read = ?, can_create = ?, can_update = ?, can_delete = ?,
                            updated_at = CURRENT_TIMESTAMP 
                            WHERE id = ?`;
                        binds = [...baseBinds, uData.id];
                    }

                    await db.prepare(sql).bind(...binds).run();
                    await recordAudit('app_users', 'UPDATE', oldUser, uData);
                } else if (params.p_action === 'delete') {
                    if (uid === user.id) throw new Error("Não pode apagar a sua própria conta.");
                    const oldUser = await db.prepare("SELECT * FROM app_users WHERE id = ?").bind(uid).first();
                    await db.prepare("DELETE FROM app_users WHERE id = ?").bind(uid).run();
                    await recordAudit('app_users', 'DELETE', oldUser, null);
                }
                break;

            case 'secure_fetch_inventory':
                // Check if user has read permission on any inventory-related module
                const canReadInventory = hasPermission(user, 'inventory', 'R') || 
                                        hasPermission(user, 'transit', 'R') || 
                                        hasPermission(user, 'stock_out', 'R');
                if (!canReadInventory) throw new Error("Acesso negado para consultar inventário.");

                let sql = "SELECT * FROM products WHERE is_deleted = 0";
                let qParams = [];

                // Intelligent Status Filter
                if (params.p_only_transit) {
                    // Transit items are 'transit' if pending, or 'available' if received from a process
                    sql += " AND (status = 'transit' OR (status = 'available' AND sales_process IS NOT NULL AND sales_process != ''))";
                } else if (params.p_only_stockout) {
                    // Stock out items are 'stockout_pending' or 'stockout_done'
                    sql += " AND (status = 'stockout_pending' OR status = 'stockout_done')";
                } else {
                    // Show all items that are not explicitly in transit or stock out
                    sql += " AND (status IS NULL OR status NOT IN ('transit', 'stockout_pending', 'stockout_done'))";
                }

                if (params.p_search) {
                    sql += " AND (name LIKE ? OR part_number LIKE ? OR brand LIKE ? OR sales_process LIKE ?)";
                    const s = `%${params.p_search}%`;
                    qParams.push(s, s, s, s);
                }
                if (params.p_category && params.p_category !== 'all') {
                    sql += " AND category = ?"; qParams.push(params.p_category);
                }
                if (params.p_location && params.p_location !== 'all') {
                    sql += " AND location = ?"; qParams.push(params.p_location);
                }
                sql += " ORDER BY name ASC";

                const { results: inv } = await db.prepare(sql).bind(...qParams).all();

                if (inv.length > 0) {
                    const productIds = inv.map((item) => item.id).filter((id) => id !== null && id !== undefined);
                    const attachmentsByProduct = new Map();
                    
                    // Fetch attachments in batches to avoid SQL variable limit
                    const BATCH_SIZE = 20;
                    for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
                        const batchIds = productIds.slice(i, i + BATCH_SIZE);
                        const placeholders = batchIds.map(() => '?').join(', ');
                        const attachmentsSql = `
                            SELECT *
                            FROM attachments
                            WHERE category = 'product' AND product_id IN (${placeholders})
                            ORDER BY product_id ASC, sort_order ASC, id ASC
                        `;
                        const { results: attachmentRows } = await db.prepare(attachmentsSql).bind(...batchIds).all();
                        
                        attachmentRows.forEach((attachment) => {
                            const current = attachmentsByProduct.get(attachment.product_id) || [];
                            current.push(attachment);
                            attachmentsByProduct.set(attachment.product_id, current);
                        });
                    }

                    inv.forEach((item) => {
                        const productAttachments = attachmentsByProduct.get(item.id) || [];
                        item.attachments = productAttachments;

                        const primaryImage = productAttachments.find((attachment) => attachment.file_type === 'image');
                        if (primaryImage?.url) {
                            item.image_url = primaryImage.url;
                        }
                    });
                }

                // DATA LEAKAGE PREVENTION: Hide cost_price if user lacks permission
                if (user.role !== 'admin' && !user.can_view_prices) {
                    inv.forEach(i => i.cost_price = null);
                }

                result = inv;
                break;

            case 'secure_save_product': {
                const sp_data = params.p_data || {};
                // Check if user has create (for new) or update (for existing) permission
                const action = sp_data.id ? 'U' : 'C';
                const canModify = hasPermission(user, 'inventory', action) || 
                                 hasPermission(user, 'transit', action) || 
                                 hasPermission(user, 'stock_out', action);
                if (!canModify) throw new Error("Acesso negado para modificar inventário.");
                if (sp_data.id) {
                    const oldProduct = await db.prepare("SELECT * FROM products WHERE id = ?").bind(sp_data.id).first();
                    await db.prepare(`UPDATE products SET part_number=?, name=?, brand=?, quantity=?, min_quantity=?, description=?, sales_process=?, category=?, location=?, pallet=?, box=?, cost_price=?, image_url=?, status=?, order_to=?, order_date=?, ship_plant=?, equipment=?, maker=?, delivery_time=?, batch_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
                        .bind(sp_data.part_number, sp_data.name, sp_data.brand, sp_data.quantity || 0, sp_data.min_quantity || 0, sp_data.description, sp_data.sales_process, sp_data.category, sp_data.location, sp_data.pallet, sp_data.box, sp_data.cost_price || 0, sp_data.image_url, sp_data.status, sp_data.order_to, sp_data.order_date || null, sp_data.ship_plant, sp_data.equipment, sp_data.maker, sp_data.delivery_time, sp_data.batch_id || null, sp_data.id).run();
                    const saveAuditId = await recordAudit('products', 'UPDATE', oldProduct, sp_data);
                    await recordEvent(
                        params.p_event_type || 'PRODUCT_EDIT',
                        params.p_event_title || 'Edição de Produto',
                        params.p_event_summary || `${oldProduct.name || sp_data.name}`,
                        sp_data.id, null, saveAuditId
                    );
                    result = sp_data.id;
                } else {
                    const insObj = await db.prepare(`INSERT INTO products (part_number, name, brand, quantity, min_quantity, description, sales_process, category, location, pallet, box, cost_price, image_url, status, order_to, order_date, ship_plant, equipment, maker, delivery_time, batch_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`)
                        .bind(sp_data.part_number, sp_data.name, sp_data.brand, sp_data.quantity || 0, sp_data.min_quantity || 0, sp_data.description, sp_data.sales_process, sp_data.category, sp_data.location, sp_data.pallet, sp_data.box, sp_data.cost_price || 0, sp_data.image_url, sp_data.status, sp_data.order_to, sp_data.order_date || null, sp_data.ship_plant, sp_data.equipment, sp_data.maker, sp_data.delivery_time, sp_data.batch_id || null).first();
                    const newId = insObj ? insObj.id : null;
                    const createAuditId = await recordAudit('products', 'INSERT', null, { ...sp_data, id: newId });
                    await recordEvent(
                        params.p_event_type || 'PRODUCT_CREATE',
                        params.p_event_title || 'Novo Produto',
                        params.p_event_summary || `${sp_data.name}`,
                        newId, null, createAuditId
                    );
                    result = newId;
                }
                break;
            }

            case 'secure_update_stock':
                // Check if user has update permission
                const canUpdateStock = hasPermission(user, 'inventory', 'U') || 
                                      hasPermission(user, 'transit', 'U') || 
                                      hasPermission(user, 'stock_out', 'U');
                if (!canUpdateStock) throw new Error("Acesso negado para modificar stock.");
                const oldProdStock = await db.prepare("SELECT * FROM products WHERE id = ?").bind(params.p_id).first();
                await db.prepare("UPDATE products SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(params.p_new_qty, params.p_id).run();
                const adjustAuditId = await recordAudit('products', 'UPDATE', oldProdStock, { ...oldProdStock, quantity: params.p_new_qty });
                await recordEvent(
                    params.p_event_type || 'STOCK_ADJUST',
                    params.p_event_title || 'Ajuste de Stock Manual',
                    params.p_event_summary || `${oldProdStock.name}: ${oldProdStock.quantity} → ${params.p_new_qty}`,
                    params.p_id, null, adjustAuditId
                );
                result = true;
                break;

            case 'secure_add_attachment': {
                const sa_data = params.p_data || {};
                // Check if user has create permission for attachments
                const canAddAttachment = hasPermission(user, 'inventory', 'C') || 
                                        hasPermission(user, 'transit', 'C') || 
                                        hasPermission(user, 'logistics', 'C');
                if (!canAddAttachment) throw new Error("Acesso negado para adicionar anexos.");
                let sortOrder = sa_data.sort_order;
                if (sortOrder === undefined || sortOrder === null || Number.isNaN(Number(sortOrder))) {
                    const sortRow = await db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order FROM attachments WHERE product_id = ? AND category = ?")
                        .bind(sa_data.product_id, sa_data.category || 'product').first();
                    sortOrder = sortRow?.next_sort_order ?? 0;
                }
                const insertResult = await db.prepare("INSERT INTO attachments (product_id, url, file_type, category, sort_order) VALUES (?, ?, ?, ?, ?)")
                    .bind(sa_data.product_id, sa_data.url, sa_data.file_type, sa_data.category, Number(sortOrder)).run();
                await recordAudit('attachments', 'INSERT', null, sa_data);
                // Return the ID of the created attachment
                const newAttachment = await db.prepare("SELECT * FROM attachments WHERE id = ?").bind(insertResult.meta.last_row_id).first();
                result = newAttachment;
                break;
            }

            case 'secure_reorder_attachments': {
                const canReorderAttachments = hasPermission(user, 'inventory', 'U') ||
                    hasPermission(user, 'transit', 'U') ||
                    hasPermission(user, 'logistics', 'U');
                if (!canReorderAttachments) throw new Error("Acesso negado para reordenar anexos.");

                const orderItems = Array.isArray(params.p_items) ? params.p_items : [];
                const productId = Number(params.p_product_id);
                if (!productId || orderItems.length === 0) {
                    result = true;
                    break;
                }

                const updates = [];
                for (const item of orderItems) {
                    const attachmentId = Number(item?.id);
                    const sortOrder = Number(item?.sort_order);
                    if (!attachmentId || Number.isNaN(sortOrder)) continue;
                    updates.push(
                        db.prepare("UPDATE attachments SET sort_order = ? WHERE id = ? AND product_id = ?")
                            .bind(sortOrder, attachmentId, productId)
                    );
                }

                if (updates.length > 0) {
                    await db.batch(updates);
                }
                result = true;
                break;
            }

            case 'secure_record_movement': {
                const sm_data = params.p_data || {};
                // Check if user has create permission for movements
                const canRecordMovement = hasPermission(user, 'inventory', 'C') || 
                                         hasPermission(user, 'transit', 'C') || 
                                         hasPermission(user, 'stock_out', 'C');
                if (!canRecordMovement) throw new Error("Acesso negado para registar movimentos.");
                await db.prepare("INSERT INTO movements (product_id, type, quantity, reason, unit_price, supplier, po_number) VALUES (?, ?, ?, ?, ?, ?, ?)")
                    .bind(sm_data.product_id, sm_data.type, sm_data.quantity, sm_data.reason, sm_data.unit_price, sm_data.supplier, sm_data.po_number).run();
                await recordAudit('movements', 'INSERT', null, sm_data);
                break;
            }

            case 'secure_update_product_field':
                // Check if user has update permission
                const canUpdateField = hasPermission(user, 'inventory', 'U');
                if (!canUpdateField) throw new Error("Acesso negado para atualizar produto.");
                const oldProdField = await db.prepare("SELECT * FROM products WHERE id = ?").bind(params.p_product_id).first();
                if (!oldProdField) throw new Error("Produto não encontrado.");
                
                // Update the specific field
                const fieldName = params.p_field;
                const fieldValue = params.p_value;
                await db.prepare(`UPDATE products SET ${fieldName} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
                    .bind(fieldValue, params.p_product_id).run();
                
                const newData = { ...oldProdField, [fieldName]: fieldValue };
                await recordAudit('products', 'UPDATE', oldProdField, newData);
                result = true;
                break;

            case 'secure_delete_attachment':
                // Check if user has delete permission for attachments
                const canDeleteAttachment = hasPermission(user, 'inventory', 'D') || 
                                           hasPermission(user, 'transit', 'D');
                if (!canDeleteAttachment) throw new Error("Acesso negado para eliminar anexos.");
                const oldAttachment = await db.prepare("SELECT * FROM attachments WHERE id = ?").bind(params.p_id).first();
                await db.prepare("DELETE FROM attachments WHERE id = ?").bind(params.p_id).run();
                await recordAudit('attachments', 'DELETE', oldAttachment, null);
                result = true;
                break;

            case 'secure_delete_product':
                // Check if user has delete permission
                const canDeleteProduct = hasPermission(user, 'inventory', 'D') || 
                                        hasPermission(user, 'transit', 'D') || 
                                        hasPermission(user, 'stock_out', 'D');
                if (!canDeleteProduct) throw new Error("Acesso negado para eliminar produtos.");
                const oldDelProd = await db.prepare("SELECT * FROM products WHERE id = ?").bind(params.p_id).first();
                await db.prepare("UPDATE products SET is_deleted = 1 WHERE id = ?").bind(params.p_id).run();
                await recordAudit('products', 'DELETE', oldDelProd, { ...oldDelProd, is_deleted: 1 });
                await recordEvent('PRODUCT_DELETE', 'Produto Removido', `${oldDelProd.name}`, params.p_id);
                result = true;
                break;

            case 'secure_fetch_any':
                // A generic fetcher. 
                if (user.role !== 'admin' && !user.can_read) throw new Error("Acesso negado para consultas.");
                let t = params.p_table;

                // CRITICAL SQL INJECTION / PRIVILEGE ESCALATION BLOCK
                if (t === 'app_users' && user.role !== 'admin') throw new Error("Acesso não autorizado a listagem de utilizadores.");
                if (t === 'historico_geral' && user.role !== 'admin' && !user.view_history) throw new Error("Acesso não autorizado ao histórico.");

                let fetchSql = `SELECT * FROM ${t === 'history' ? 'historico_geral' : t}`;
                let bParams = [];
                if (params.p_params && params.p_params.eq) {
                    const keys = Object.keys(params.p_params.eq);
                    if (keys.length > 0) {
                        fetchSql += ` WHERE ${keys[0]} = ?`;
                        bParams.push(params.p_params.eq[keys[0]]);
                    }
                }
                if (params.p_params && params.p_params.order) {
                    const orderColumn = String(params.p_params.order.column || '').trim();
                    const isSafeColumn = /^[A-Za-z_][A-Za-z0-9_]*$/.test(orderColumn);
                    if (isSafeColumn) {
                        const direction = params.p_params.order.ascending === false ? 'DESC' : 'ASC';
                        fetchSql += ` ORDER BY ${orderColumn} ${direction}`;
                    }
                } else if (t === 'attachments') {
                    fetchSql += ' ORDER BY sort_order ASC, id ASC';
                } else if (t === 'movements') {
                    fetchSql += ' ORDER BY created_at DESC';
                }

                const { results: anyRes } = await db.prepare(fetchSql).bind(...bParams).all();

                if (t === 'products' && user.role !== 'admin' && !user.can_view_prices) {
                    anyRes.forEach(i => i.cost_price = null);
                }

                result = anyRes;
                break;

            case 'secure_fetch_phc':
                if (user.role !== 'admin' && user.view_transit === 0 && user.transit_access === 'none' && user.view_stock_out === 0 && user.stock_out_access === 'none') throw new Error("Acesso negado a dados Transit/PHC.");
                const { results: phcRes } = await db.prepare("SELECT * FROM phc").all();
                result = phcRes;
                break;

            case 'secure_fetch_phc_ids':
                const { results: phcIdsRes } = await db.prepare("SELECT processo_id FROM phc WHERE processo_id IS NOT NULL").all();
                result = phcIdsRes;
                break;

            case 'secure_search_phc':
                const searchTerm = params.p_search ? `%${params.p_search}%` : '%';
                const { results: searchPhcRes } = await db.prepare("SELECT * FROM phc WHERE processo_id LIKE ? OR cliente_principal LIKE ? OR cliente_final LIKE ? LIMIT 50").bind(searchTerm, searchTerm, searchTerm).all();
                result = searchPhcRes;
                break;

            case 'get_table_columns':
                if (user.role !== 'admin' && !user.can_read) throw new Error("Acesso não autorizado.");
                const tName = params.p_table_name;
                
                const allowedTables = ['products', 'logistics_items', 'movements', 'attachments', 'historico_geral', 'app_events', 'phc'];
                if (!allowedTables.includes(tName)) {
                    throw new Error("Tabela não permitida.");
                }
                
                const { results: pragmaRes } = await db.prepare(`PRAGMA table_info(${tName})`).all();
                result = pragmaRes.map(col => ({ column_name: col.name }));
                break;

            case 'secure_chunked_import':
                // Handle chunked import for large files
                const importId = params.p_import_id;
                const chunkIndex = params.p_chunk_index;
                const chunkData = params.p_chunk_data;
                const totalChunks = params.p_total_chunks;
                const tableName = params.p_table_name;
                
                if (!importId || chunkData === undefined) {
                    throw new Error("Parâmetros de importação inválidos.");
                }
                
                // Process chunk
                const insertedIds = [];
                const failedItems = [];
                
                // Pre-fetch valid columns
                const { results: tableCols } = await db.prepare(`PRAGMA table_info(${tableName})`).all();
                const validKeys = new Set(tableCols.map(c => c.name));
                
                // Process items in chunk
                for (let i = 0; i < chunkData.length; i++) {
                    const item = chunkData[i];
                    try {
                        const filteredItem = {};
                        Object.keys(item).forEach(k => {
                            if (validKeys.has(k) && item[k] !== undefined && item[k] !== null) {
                                filteredItem[k] = item[k];
                            }
                        });
                        
                        // Set defaults based on table
                        if (tableName === 'products') {
                            if (!filteredItem.name) filteredItem.name = 'Sem Designação (Auto)';
                            if (!filteredItem.part_number) filteredItem.part_number = 'Sem Referência';
                            if (!filteredItem.brand) filteredItem.brand = '-';
                            if (!filteredItem.location || filteredItem.location === 'Almoxarifado') filteredItem.location = '1';
                            if (!filteredItem.is_deleted) filteredItem.is_deleted = 0;
                            if (!filteredItem.quantity) filteredItem.quantity = 0;
                            if (!filteredItem.min_quantity) filteredItem.min_quantity = 5;
                            if (!filteredItem.status) filteredItem.status = 'available';
                            if (!filteredItem.category) filteredItem.category = 'Import';
                        }
                        
                        filteredItem.updated_at = new Date().toISOString();
                        
                        const keys = Object.keys(filteredItem);
                        const bindings = keys.map(() => '?').join(', ');
                        const vals = keys.map(k => filteredItem[k]);
                        
                        const { results: insertResult } = await db.prepare(`
                            INSERT INTO ${tableName} (${keys.join(', ')}) 
                            VALUES (${bindings}) 
                            RETURNING id
                        `).bind(...vals).all();
                        
                        if (insertResult.length > 0) {
                            insertedIds.push(insertResult[0].id);
                            
                            // Track item in import_items
                            await db.prepare(`
                                INSERT INTO import_items 
                                (id, import_id, row_number, item_id, status, data)
                                VALUES (?, ?, ?, ?, ?, ?)
                            `).bind(
                                crypto.randomUUID(),
                                importId,
                                (chunkIndex * 1000) + i + 1,
                                insertResult[0].id,
                                'success',
                                JSON.stringify(item)
                            ).run();
                        }
                    } catch (error) {
                        failedItems.push({
                            row_number: (chunkIndex * 1000) + i + 1,
                            error: error.message,
                            data: item
                        });
                        
                        // Track failed item
                        await db.prepare(`
                            INSERT INTO import_items 
                            (id, import_id, row_number, status, error_message, data)
                            VALUES (?, ?, ?, ?, ?, ?)
                        `).bind(
                            crypto.randomUUID(),
                            importId,
                            (chunkIndex * 1000) + i + 1,
                            'failed',
                            error.message,
                            JSON.stringify(item)
                        ).run();
                    }
                }
                
                // Update import history
                const isLastChunk = chunkIndex === totalChunks - 1;
                await db.prepare(`
                    UPDATE import_history 
                    SET imported_items = imported_items + ?,
                        failed_items = failed_items + ?,
                        status = ?,
                        end_time = ?
                    WHERE id = ?
                `).bind(
                    insertedIds.length,
                    failedItems.length,
                    isLastChunk ? 'completed' : 'processing',
                    isLastChunk ? new Date().toISOString() : null,
                    importId
                ).run();
                
                result = {
                    success: true,
                    chunk_index: chunkIndex,
                    inserted: insertedIds.length,
                    failed: failedItems.length,
                    is_complete: isLastChunk
                };
                break;
                
            case 'create_import_history':
                // Create initial import history record
                const newImportId = params.p_import_id;
                const importTableName = params.p_table_name;
                const importFileName = params.p_file_name;
                const importFileSize = params.p_file_size;
                
                // Use user_id if it exists in app_users, otherwise use a placeholder
                const validUserId = user.id || 'system';
                
                await db.prepare(`
                    INSERT INTO import_history 
                    (id, user_id, user_name, table_name, total_items, imported_items, failed_items, status, start_time, file_name, file_size)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(
                    newImportId,
                    validUserId,
                    user.username || 'System',
                    importTableName,
                    0,
                    0,
                    0,
                    'processing',
                    new Date().toISOString(),
                    importFileName,
                    importFileSize
                ).run();
                
                result = { success: true, import_id: newImportId };
                break;
                
            case 'finalize_import':
                // Finalize import with final counts
                const finalImportId = params.p_import_id;
                const finalInserted = params.p_total_inserted;
                const finalFailed = params.p_total_failed;
                const finalStatus = params.p_status;
                
                await db.prepare(`
                    UPDATE import_history 
                    SET imported_items = ?,
                        failed_items = ?,
                        status = ?,
                        end_time = ?
                    WHERE id = ?
                `).bind(
                    finalInserted,
                    finalFailed,
                    finalStatus,
                    new Date().toISOString(),
                    finalImportId
                ).run();
                
                result = { success: true };
                break;
                
            case 'revert_import':
                // Revert an entire import
                if (user.role !== 'admin' && user.inventory_access !== 'write') {
                    throw new Error("Acesso negado para reverter importação.");
                }
                
                const revertImportId = params.p_import_id;
                
                // Get import details
                const importInfo = await db.prepare(`
                    SELECT * FROM import_history 
                    WHERE id = ? AND status = 'completed'
                `).bind(revertImportId).first();
                
                if (!importInfo) {
                    throw new Error("Importação não encontrada ou não pode ser revertida.");
                }
                
                // Get all items to delete
                const { results: itemsToDelete } = await db.prepare(`
                    SELECT item_id FROM import_items 
                    WHERE import_id = ? AND status = 'success' AND item_id IS NOT NULL
                `).bind(revertImportId).all();
                
                // Delete in batches
                const DELETE_BATCH_SIZE = 100;
                let deletedCount = 0;
                
                for (let i = 0; i < itemsToDelete.length; i += DELETE_BATCH_SIZE) {
                    const batch = itemsToDelete.slice(i, i + DELETE_BATCH_SIZE);
                    const deleteStmts = batch.map(item => 
                        db.prepare(`DELETE FROM ${importInfo.table_name} WHERE id = ?`).bind(item.item_id)
                    );
                    
                    await db.batch(deleteStmts);
                    deletedCount += batch.length;
                }
                
                // Update status
                await db.prepare(`
                    UPDATE import_history 
                    SET status = 'reverted', end_time = ?
                    WHERE id = ?
                `).bind(new Date().toISOString(), revertImportId).run();
                
                await db.prepare(`
                    UPDATE import_items 
                    SET status = 'reverted'
                    WHERE import_id = ?
                `).bind(revertImportId).run();
                
                // Record audit
                await recordAudit(
                    importInfo.table_name,
                    'BULK_DELETE',
                    { count: deletedCount },
                    { import_id: revertImportId, reverted_by: user.username }
                );
                
                result = { success: true, deleted_items: deletedCount };
                break;
                
            case 'get_import_history':
                // Get import history with pagination
                const historyLimit = params.p_limit || 50;
                const historyOffset = params.p_offset || 0;
                const filterTable = params.p_table_name;
                const includeDetails = params.p_include_details || false;
                
                let historyQuery = `
                    SELECT ih.*, 
                           COUNT(ii.id) as total_items_count
                    FROM import_history ih
                    LEFT JOIN import_items ii ON ih.id = ii.import_id
                `;
                
                const historyBindings = [];
                
                if (filterTable) {
                    historyQuery += ' WHERE ih.table_name = ?';
                    historyBindings.push(filterTable);
                }
                
                historyQuery += `
                    GROUP BY ih.id
                    ORDER BY ih.created_at DESC
                    LIMIT ? OFFSET ?
                `;
                
                historyBindings.push(historyLimit, historyOffset);
                
                const { results: historyResults } = await db.prepare(historyQuery).bind(...historyBindings).all();
                
                // Get detailed items if requested
                if (includeDetails) {
                    for (const importRecord of historyResults) {
                        const { results: items } = await db.prepare(`
                            SELECT * FROM import_items 
                            WHERE import_id = ?
                            ORDER BY row_number
                        `).bind(importRecord.id).all();
                        importRecord.items = items;
                    }
                }
                
                result = historyResults;
                break;
                
            case 'secure_batch_import':
            case 'secure_batch_import_with_ids':
                // Check if user has create permission for batch import
                const canBatchImport = hasPermission(user, 'inventory', 'C') || 
                                      hasPermission(user, 'transit', 'C') || 
                                      hasPermission(user, 'logistics', 'C');
                if (!canBatchImport) throw new Error("Acesso negado a importação em lote.");
                const targetTable = params.p_target;
                const itemsToInsert = params.p_items;
                if (!itemsToInsert || itemsToInsert.length === 0) {
                    result = (rpc === 'secure_batch_import_with_ids') ? [] : 0;
                    break;
                }
                const batchInsertedIds = [];

                // Pre-fetch valid columns to avoid crashing on unknown keys
                const { results: batchTableCols } = await db.prepare(`PRAGMA table_info(${targetTable})`).all();
                const batchValidKeys = new Set(batchTableCols.map(c => c.name));

                // Cloudflare D1 allows max 1000 queries per invocation. We need to Batch them.
                // Increased CHUNK_SIZE for better performance with large imports
                const CHUNK_SIZE = 100;

                for (let i = 0; i < itemsToInsert.length; i += CHUNK_SIZE) {
                    const chunk = itemsToInsert.slice(i, i + CHUNK_SIZE);
                    const stmts = [];

                    for (const item of chunk) {
                        const filteredItem = {};
                        Object.keys(item).forEach(k => {
                            if (batchValidKeys.has(k) && item[k] !== undefined) {
                                filteredItem[k] = item[k];
                            }
                        });

                        if (targetTable === 'products') {
                            if (!filteredItem.name) filteredItem.name = 'Sem Designação (Auto)';
                            if (!filteredItem.part_number) filteredItem.part_number = 'Sem Referência';
                            if (!filteredItem.brand) filteredItem.brand = '-';
                            if (!filteredItem.location || filteredItem.location === 'Almoxarifado') filteredItem.location = '1';
                        }

                        const keys = Object.keys(filteredItem);
                        const bindings = keys.map(() => '?').join(', ');
                        const vals = keys.map(k => filteredItem[k]);

                        stmts.push(db.prepare(`INSERT INTO ${targetTable} (${keys.join(', ')}) VALUES (${bindings}) RETURNING id`).bind(...vals));
                    }

                    const batchResults = await db.batch(stmts);
                    for (let j = 0; j < batchResults.length; j++) {
                        const batchRes = batchResults[j];
                        const nid = batchRes.results && batchRes.results.length > 0 ? batchRes.results[0].id : null;
                        batchInsertedIds.push(nid);

                        // Re-enable individual audit for reversion support, but hidden in UI
                        const originalItem = chunk[j];
                        await recordAudit(targetTable, 'INSERT', null, { ...originalItem, id: nid });
                    }
                }

                const batchId = itemsToInsert[0].batch_id || `BATCH-${Date.now()}`;
                const eventLabel = params.p_label || (targetTable === 'products' ? 'Importação de Inventário' : 'Importação de Logística');
                const extraDetails = params.p_details && typeof params.p_details === 'object' ? params.p_details : {};
                const eventSummary = params.p_summary || `${itemsToInsert.length} itens importados`;

                await recordEvent(
                    'BATCH_IMPORT',
                    eventLabel,
                    eventSummary,
                    batchId,
                    {
                        count: itemsToInsert.length,
                        table: targetTable,
                        sample: itemsToInsert[0].name || itemsToInsert[0].part_number,
                        batch_id: batchId,
                        ...extraDetails
                    }
                );

                result = (rpc === 'secure_batch_import_with_ids') ? batchInsertedIds : itemsToInsert.length;
                break;

            case 'secure_fetch_logistics':
                if (user.role !== 'admin' && !user.view_logistics && user.logistics_access === 'none') throw new Error("Acesso negado à logística.");
                const { results: logRes } = await db.prepare("SELECT * FROM logistics_items WHERE is_deleted = 0 ORDER BY status DESC, id DESC").all();
                if (logRes.length > 0) {
                    const logisticsIds = logRes.map((item) => item.id).filter((id) => id !== null && id !== undefined);
                    const placeholders = logisticsIds.map(() => '?').join(', ');
                    const attachmentsSql = `
                        SELECT *
                        FROM attachments
                        WHERE category = 'reception' AND product_id IN (${placeholders})
                        ORDER BY product_id ASC, sort_order ASC, id ASC
                    `;
                    const { results: logisticsAttachmentRows } = await db.prepare(attachmentsSql).bind(...logisticsIds).all();
                    const attachmentsByLogisticsItem = new Map();

                    logisticsAttachmentRows.forEach((attachment) => {
                        const current = attachmentsByLogisticsItem.get(attachment.product_id) || [];
                        current.push(attachment);
                        attachmentsByLogisticsItem.set(attachment.product_id, current);
                    });

                    logRes.forEach((item) => {
                        const itemAttachments = attachmentsByLogisticsItem.get(item.id) || [];
                        item.attachments = itemAttachments;

                        const primaryImage = itemAttachments.find((attachment) => attachment.file_type === 'image');
                        if (primaryImage?.url) {
                            item.image_url = primaryImage.url;
                        }
                    });
                }
                result = logRes;
                break;

            case 'secure_fetch_history':
                if (user.role !== 'admin' && !user.view_history) throw new Error("Acesso negado ao histórico geral.");
                if (params.p_count_only) {
                    const countRes = await db.prepare("SELECT COUNT(*) as total FROM movements").first();
                    result = countRes ? countRes.total : 0;
                } else {
                    const limit = params.p_limit || 1000;
                    const { results: moveResList } = await db.prepare("SELECT m.*, p.name as product_name FROM movements m LEFT JOIN products p ON m.product_id = p.id ORDER BY m.created_at DESC LIMIT ?").bind(limit).all();
                    result = moveResList;
                }
                break;

            case 'secure_fetch_app_events': {
                if (user.role !== 'admin' && !user.view_history) throw new Error("Acesso negado ao histórico de atividades.");
                const eventTypeFilter = params.p_event_type || null;
                const whereClause = eventTypeFilter ? "WHERE event_type = ?" : "";
                const bindings = eventTypeFilter ? [eventTypeFilter] : [];

                if (params.p_count_only) {
                    const countQuery = `SELECT COUNT(*) as total FROM app_events ${whereClause}`;
                    const countRes = eventTypeFilter
                        ? await db.prepare(countQuery).bind(...bindings).first()
                        : await db.prepare(countQuery).first();
                    result = countRes ? countRes.total : 0;
                } else {
                    const limit = params.p_limit || 100;
                    const offset = params.p_offset || 0;
                    const query = `SELECT * FROM app_events ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
                    const { results: eventRes } = await db.prepare(query).bind(...bindings, limit, offset).all();
                    result = eventRes;
                }
                break;
            }

            case 'secure_mark_event_reverted': {
                if (user.role !== 'admin' && !user.can_update) throw new Error("Sem permissão para anular eventos.");
                if (params.p_batch_id) {
                    await db.prepare("UPDATE app_events SET reverted_at = CURRENT_TIMESTAMP, reverted_by = ? WHERE target_id = ?").bind(user.username, params.p_batch_id).run();
                } else if (params.p_event_id) {
                    await db.prepare("UPDATE app_events SET reverted_at = CURRENT_TIMESTAMP, reverted_by = ? WHERE id = ?").bind(user.username, params.p_event_id).run();
                }
                result = true;
                break;
            }

            case 'secure_fetch_audit_history': {
                if (user.role !== 'admin' && !user.view_history) throw new Error("Acesso negado a auditoria profunda.");
                const auditLimit = params.p_limit || 100;
                const auditOffset = params.p_offset || 0;

                const { results: baseRes } = await db.prepare("SELECT * FROM historico_geral WHERE tabela_nome NOT IN ('historico_geral', 'movements') ORDER BY criado_em DESC LIMIT ? OFFSET ?").bind(auditLimit, auditOffset).all();

                let finalResults = [...baseRes];

                // Intelligently expand batches so they are never cut
                const expandBatch = async (item) => {
                    let bId = null;
                    if (item && item.dados_novos && item.dados_novos.includes('batch_id')) {
                        try { bId = JSON.parse(item.dados_novos).batch_id; } catch (e) { }
                    }
                    if (!bId && item && item.dados_antigos && item.dados_antigos.includes('batch_id')) {
                        try { bId = JSON.parse(item.dados_antigos).batch_id; } catch (e) { }
                    }
                    if (bId) {
                        const { results: ext } = await db.prepare("SELECT * FROM historico_geral WHERE dados_novos LIKE ? OR dados_antigos LIKE ?").bind(`%${bId}%`, `%${bId}%`).all();
                        return ext;
                    }
                    return [];
                };

                if (baseRes.length > 0) {
                    const firstItem = baseRes[0];
                    const lastItem = baseRes[baseRes.length - 1];

                    const [firstExt, lastExt] = await Promise.all([
                        expandBatch(firstItem),
                        expandBatch(lastItem)
                    ]);

                    const existingIds = new Set(finalResults.map(i => i.id));
                    const merge = (arr) => {
                        for (const r of arr) {
                            if (!existingIds.has(r.id)) {
                                finalResults.push(r);
                                existingIds.add(r.id);
                            }
                        }
                    };

                    if (firstExt.length > 0) merge(firstExt);
                    if (lastExt.length > 0) merge(lastExt);
                }

                // Keep them descending by date
                finalResults.sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));

                result = finalResults;
                break;
            }

            case 'secure_update_logistics_item':
                // Check if user has update permission for logistics
                if (!hasPermission(user, 'logistics', 'U')) throw new Error("Acesso negado para editar logística.");
                const ulData = params.p_data;
                const oldLogItem = await db.prepare("SELECT * FROM logistics_items WHERE id = ?").bind(params.p_id).first();
                
                // Limit to safe number of fields to avoid SQL variable limits
                const safeFields = ['status', 'destination', 'notes', 'tracking_number', 'shipped_by', 'shipped_at', 'shipment_id', 'carrier', 'box_dimensions', 'box_image_url'];
                const updateSets = [];
                const updateParams = [];
                
                for (const key of safeFields) {
                    if (key in ulData) {
                        updateSets.push(`${key} = ?`);
                        updateParams.push(ulData[key]);
                    }
                }
                updateParams.push(params.p_id);
                
                if (updateSets.length > 0) {
                    await db.prepare(`UPDATE logistics_items SET ${updateSets.join(', ')} WHERE id = ?`).bind(...updateParams).run();
                    await recordAudit('logistics_items', 'UPDATE', oldLogItem, { ...oldLogItem, ...ulData });
                }
                result = params.p_id;
                break;

            case 'secure_manage_logistics':
                // Check if user has update/delete permission for logistics management
                const canManageLogistics = hasPermission(user, 'logistics', 'U') || hasPermission(user, 'logistics', 'D');
                if (!canManageLogistics) throw new Error("Acesso negado para gerir logística.");
                const action = params.p_action;
                const mData = params.p_data || {};
                const procList = params.p_process;

                if (action === 'ship') {
                    const oldLogItems = await db.prepare("SELECT * FROM logistics_items WHERE sales_process = ? AND status = 'received'").bind(procList).all();
                    await db.prepare("UPDATE logistics_items SET status = 'shipped', shipped_by = ?, shipped_at = ?, shipment_id = ?, carrier = ?, box_dimensions = ?, box_image_url = ? WHERE sales_process = ? AND status = 'received'")
                        .bind(mData.shipped_by, mData.shipped_at, mData.shipment_id, mData.carrier, mData.box_dimensions, mData.box_image_url, procList).run();
                    await recordAudit('logistics_items', 'UPDATE', oldLogItems.results, { status: 'shipped', ...mData });
                } else if (action === 'undo_ship') {
                    const oldLogItems = mData.shipment_id
                        ? await db.prepare("SELECT * FROM logistics_items WHERE shipment_id = ?").bind(mData.shipment_id).all()
                        : await db.prepare("SELECT * FROM logistics_items WHERE sales_process = ? AND status = 'shipped'").bind(procList).all();

                    if (mData.shipment_id) {
                        await db.prepare("UPDATE logistics_items SET status = 'received', shipped_by = null, shipped_at = null, shipment_id = null, carrier = null, box_dimensions = null, box_image_url = null WHERE shipment_id = ?").bind(mData.shipment_id).run();
                    } else {
                        await db.prepare("UPDATE logistics_items SET status = 'received', shipped_by = null, shipped_at = null, shipment_id = null, carrier = null, box_dimensions = null, box_image_url = null WHERE sales_process = ? AND status = 'shipped'").bind(procList).run();
                    }
                    await recordAudit('logistics_items', 'UPDATE', oldLogItems.results, { status: 'received' });
                } else if (action === 'delete' || action === 'delete_process') {
                    const oldLogItems = await db.prepare("SELECT * FROM logistics_items WHERE sales_process = ?").bind(procList).all();
                    await db.prepare("UPDATE logistics_items SET is_deleted = 1 WHERE sales_process = ?").bind(procList).run();
                    await recordAudit('logistics_items', 'UPDATE', oldLogItems.results, { is_deleted: 1 });
                } else if (action === 'delete_item') {
                    const oldLogItem = await db.prepare("SELECT * FROM logistics_items WHERE id = ?").bind(mData.id).first();
                    await db.prepare("UPDATE logistics_items SET is_deleted = 1 WHERE id = ?").bind(mData.id).run();
                    await recordAudit('logistics_items', 'UPDATE', oldLogItem, { ...oldLogItem, is_deleted: 1 });
                } else if (action === 'change_urgency' || action === 'update_urgency') {
                    const oldLogItems = await db.prepare("SELECT * FROM logistics_items WHERE sales_process = ?").bind(procList).all();
                    await db.prepare("UPDATE logistics_items SET urgency_level = ? WHERE sales_process = ?").bind(mData.urgency_level, procList).run();
                    await recordAudit('logistics_items', 'UPDATE', oldLogItems.results, { urgency_level: mData.urgency_level });
                }
                result = true;
                break;

            case 'secure_factory_reset':
                if (user.role !== 'admin') throw new Error("Acesso negado para formatar a base de dados.");
                const statements = [
                    db.prepare("DELETE FROM products"),
                    db.prepare("DELETE FROM logistics_items"),
                    db.prepare("DELETE FROM movements"),
                    db.prepare("DELETE FROM attachments"),
                    db.prepare("DELETE FROM historico_geral"),
                    db.prepare("DELETE FROM app_events")
                ];
                await db.batch(statements);
                await db.prepare(
                    `INSERT INTO historico_geral (id, tabela_nome, operacao, utilizador_id, utilizador_nome, dados_antigos, dados_novos, eh_reversao) 
                     VALUES (?, 'SYSTEM', 'FACTORY_RESET', ?, ?, NULL, ?, 0)`
                ).bind(crypto.randomUUID(), user.id, user.username, JSON.stringify({ reason: "System Wiped by Admin" })).run();
                result = true;
                break;

            case 'secure_sync_users':
                if (user.role !== 'admin') throw new Error("Acesso negado. Apenas administradores.");
                
                // Delete all existing users
                await db.prepare("DELETE FROM app_users").run();
                
                // Create clean admin user
                await db.prepare(`
                    INSERT INTO app_users (
                        id, username, password, role,
                        can_read, can_create, can_update, can_delete,
                        view_dashboard, view_inventory, view_history, view_transit, view_admin,
                        can_view_prices,
                        inventory_access, logistics_access, transit_access,
                        view_logistics, view_settings,
                        history_access, dashboard_access, settings_access, admin_access,
                        backups_access, usage_access,
                        view_backups, view_usage, view_stock_out, stock_out_access,
                        created_at, updated_at
                    ) VALUES (
                        'admin-123', 'admin', 'admin', 'admin',
                        1, 1, 1, 1,
                        1, 1, 1, 1, 1,
                        1,
                        'RCUD', 'RCUD', 'RCUD',
                        1, 1,
                        'RCUD', 'RCUD', 'RCUD', 'RCUD',
                        'RCUD', 'RCUD',
                        1, 1, 1, 'RCUD',
                        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    )
                `).run();
                
                // Verify
                const { results: syncedUsers } = await db.prepare("SELECT username, role FROM app_users").all();
                result = { success: true, users: syncedUsers, message: 'Users synced! Login with admin/admin' };
                break;

            default:
                throw new Error("RPC Operation not mapped in Cloudflare APIs: " + rpc);
        }

        return new Response(JSON.stringify({ data: result }), { status: 200 });

    } catch (err) {
        console.error("D1 RPC Err:", err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}

export async function onRequest(context) {
    // Cloudflare Pages Functions chama onRequestPost para POST
    if (context.request.method === 'POST') {
        return onRequestPost(context);
    }
    return new Response('Method not allowed', { status: 405 });
}
