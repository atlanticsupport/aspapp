// CLOUDFLARE PAGES - RPC MOCK HANDLER PARA SQLITE D1
export async function onRequestPost({ request, env }) {
    try {
        const body = await request.json();
        const { rpc, params } = body;

        const db = env.DB;
        if (!db) throw new Error("Database binding 'DB' not found.");

        let user = null;

        // 1. AUTHENTICATION & LOGIN
        if (rpc === 'rpc_login') {
            user = await db.prepare("SELECT * FROM app_users WHERE username = ? AND password = ?")
                .bind(params.p_username, params.p_password)
                .first();
            if (!user) return new Response(JSON.stringify({ error: "Credenciais inválidas." }), { status: 401 });
            return new Response(JSON.stringify({ data: [user] }), { status: 200 }); // Retorna array para simular RPC Postgres
        }

        // All other RPCs need standard auth validation
        let authUser, authPass;
        if (params.p_user && params.p_pass) { authUser = params.p_user; authPass = params.p_pass; }
        else if (params.p_admin_user && params.p_admin_pass) { authUser = params.p_admin_user; authPass = params.p_admin_pass; }

        if (authUser && authPass) {
            user = await db.prepare("SELECT * FROM app_users WHERE username = ? AND password = ?")
                .bind(authUser, authPass)
                .first();
            if (!user) return new Response(JSON.stringify({ error: "Credenciais inválidas para operação de base de dados." }), { status: 401 });
        } else {
            return new Response(JSON.stringify({ error: "Missing authentication parameters." }), { status: 401 });
        }

        // 2. ROUTING THE MOCKED RPC CALLS
        let result = [];
        const { p_data } = params;

        switch (rpc) {
            case 'secure_fetch_users':
                if (user.role !== 'admin') throw new Error("Acesso negado. Apenas administradores.");
                const { results: users } = await db.prepare("SELECT * FROM app_users ORDER BY role, username").all();
                result = users;
                break;

            case 'rpc_manage_user':
                if (user.role !== 'admin') throw new Error("Acesso negado.");
                const uData = params.p_user_data;
                const uid = uData.id || crypto.randomUUID();

                if (params.p_action === 'create') {
                    await db.prepare(`INSERT INTO app_users (id, username, password, role, can_read, can_create, can_update, can_delete, view_dashboard, view_inventory, view_history, view_transit, view_admin, can_view_prices, inventory_access, logistics_access, transit_access, view_logistics, view_settings) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                        .bind(uid, uData.username, uData.password, uData.role, uData.can_read ? 1 : 0, uData.can_create ? 1 : 0, uData.can_update ? 1 : 0, uData.can_delete ? 1 : 0, uData.view_dashboard ? 1 : 0, uData.view_inventory ? 1 : 0, uData.view_history ? 1 : 0, uData.view_transit ? 1 : 0, uData.view_admin ? 1 : 0, uData.can_view_prices ? 1 : 0, uData.inventory_access, uData.logistics_access, uData.transit_access, uData.view_logistics ? 1 : 0, uData.view_settings ? 1 : 0)
                        .run();
                } else if (params.p_action === 'update') {
                    if (uData.password) {
                        await db.prepare("UPDATE app_users SET username = ?, password = ?, role = ?, can_read=?, can_create=?, can_update=?, can_delete=?, view_dashboard=?, view_inventory=?, view_history=?, view_transit=?, view_admin=?, can_view_prices=?, inventory_access=?, logistics_access=?, transit_access=?, view_logistics=?, view_settings=?, updated_at=CURRENT_TIMESTAMP WHERE id = ?")
                            .bind(uData.username, uData.password, uData.role, uData.can_read ? 1 : 0, uData.can_create ? 1 : 0, uData.can_update ? 1 : 0, uData.can_delete ? 1 : 0, uData.view_dashboard ? 1 : 0, uData.view_inventory ? 1 : 0, uData.view_history ? 1 : 0, uData.view_transit ? 1 : 0, uData.view_admin ? 1 : 0, uData.can_view_prices ? 1 : 0, uData.inventory_access, uData.logistics_access, uData.transit_access, uData.view_logistics ? 1 : 0, uData.view_settings ? 1 : 0, uData.id).run();
                    } else {
                        await db.prepare("UPDATE app_users SET username = ?, role = ?, can_read=?, can_create=?, can_update=?, can_delete=?, view_dashboard=?, view_inventory=?, view_history=?, view_transit=?, view_admin=?, can_view_prices=?, inventory_access=?, logistics_access=?, transit_access=?, view_logistics=?, view_settings=?, updated_at=CURRENT_TIMESTAMP WHERE id = ?")
                            .bind(uData.username, uData.role, uData.can_read ? 1 : 0, uData.can_create ? 1 : 0, uData.can_update ? 1 : 0, uData.can_delete ? 1 : 0, uData.view_dashboard ? 1 : 0, uData.view_inventory ? 1 : 0, uData.view_history ? 1 : 0, uData.view_transit ? 1 : 0, uData.view_admin ? 1 : 0, uData.can_view_prices ? 1 : 0, uData.inventory_access, uData.logistics_access, uData.transit_access, uData.view_logistics ? 1 : 0, uData.view_settings ? 1 : 0, uData.id).run();
                    }
                }
                break;

            case 'secure_fetch_inventory':
                if (user.role !== 'admin' && user.inventory_access === 'none' && user.transit_access === 'none' && !user.view_inventory) throw new Error("Acesso negado.");
                let sql = "SELECT * FROM products WHERE is_deleted = 0";
                let qParams = [];
                if (params.p_search) {
                    sql += " AND (name LIKE ? OR part_number LIKE ? OR brand LIKE ?)";
                    const s = `%${params.p_search}%`;
                    qParams.push(s, s, s);
                }
                if (params.p_category && params.p_category !== 'all') {
                    sql += " AND category = ?"; qParams.push(params.p_category);
                }
                if (params.p_location && params.p_location !== 'all') {
                    sql += " AND location = ?"; qParams.push(params.p_location);
                }
                sql += " ORDER BY name ASC";

                const { results: inv } = await db.prepare(sql).bind(...qParams).all();
                result = inv;
                break;

            case 'secure_save_product':
                if (user.role !== 'admin' && user.inventory_access !== 'write' && user.transit_access !== 'write') throw new Error("Acesso negado para modificar inventário.");
                if (p_data.id) {
                    await db.prepare(`UPDATE products SET part_number=?, name=?, brand=?, quantity=?, min_quantity=?, description=?, sales_process=?, category=?, location=?, pallet=?, box=?, cost_price=?, image_url=?, status=?, order_to=?, order_date=?, ship_plant=?, equipment=?, maker=?, delivery_time=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
                        .bind(p_data.part_number, p_data.name, p_data.brand, p_data.quantity || 0, p_data.min_quantity || 0, p_data.description, p_data.sales_process, p_data.category, p_data.location, p_data.pallet, p_data.box, p_data.cost_price || 0, p_data.image_url, p_data.status, p_data.order_to, p_data.order_date || null, p_data.ship_plant, p_data.equipment, p_data.maker, p_data.delivery_time, p_data.id).run();
                    result = p_data.id;
                } else {
                    const insObj = await db.prepare(`INSERT INTO products (part_number, name, brand, quantity, min_quantity, description, sales_process, category, location, pallet, box, cost_price, image_url, status, order_to, order_date, ship_plant, equipment, maker, delivery_time) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`)
                        .bind(p_data.part_number, p_data.name, p_data.brand, p_data.quantity || 0, p_data.min_quantity || 0, p_data.description, p_data.sales_process, p_data.category, p_data.location, p_data.pallet, p_data.box, p_data.cost_price || 0, p_data.image_url, p_data.status, p_data.order_to, p_data.order_date || null, p_data.ship_plant, p_data.equipment, p_data.maker, p_data.delivery_time).first();
                    result = insObj ? insObj.id : null;
                }
                break;

            case 'secure_update_stock':
                if (user.role !== 'admin' && user.inventory_access !== 'write' && user.transit_access !== 'write') throw new Error("Acesso negado para modificar stock.");
                await db.prepare("UPDATE products SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(params.p_new_qty, params.p_id).run();
                result = true;
                break;

            case 'secure_add_attachment':
                if (user.role !== 'admin' && user.inventory_access !== 'write' && user.transit_access !== 'write' && user.logistics_access !== 'write') throw new Error("Acesso negado para adicionar anexos.");
                await db.prepare("INSERT INTO attachments (product_id, url, file_type, category) VALUES (?, ?, ?, ?)")
                    .bind(p_data.product_id, p_data.url, p_data.file_type, p_data.category).run();
                break;

            case 'secure_record_movement':
                if (user.role !== 'admin' && user.inventory_access !== 'write' && user.transit_access !== 'write') throw new Error("Acesso negado para registar movimentos.");
                await db.prepare("INSERT INTO movements (product_id, type, quantity, reason, unit_price, supplier, po_number) VALUES (?, ?, ?, ?, ?, ?, ?)")
                    .bind(p_data.product_id, p_data.type, p_data.quantity, p_data.reason, p_data.unit_price, p_data.supplier, p_data.po_number).run();
                break;

            case 'secure_delete_product':
                if (user.role !== 'admin' && !user.can_delete) throw new Error("Acesso negado para eliminar produtos.");
                // Actually an update to is_deleted = 1
                await db.prepare("UPDATE products SET is_deleted = 1 WHERE id = ?").bind(params.p_id).run();
                break;

            case 'secure_fetch_any':
                // A generic fetcher. 
                if (user.role !== 'admin' && !user.can_read) throw new Error("Acesso negado para consultas.");
                let t = params.p_table;
                let fetchSql = `SELECT * FROM ${t === 'history' ? 'historico_geral' : t}`;
                let bParams = [];
                if (params.p_params && params.p_params.eq) {
                    const keys = Object.keys(params.p_params.eq);
                    if (keys.length > 0) {
                        fetchSql += ` WHERE ${keys[0]} = ?`;
                        bParams.push(params.p_params.eq[keys[0]]);
                    }
                }
                if (t === 'movements') fetchSql += ' ORDER BY created_at DESC';

                const { results: anyRes } = await db.prepare(fetchSql).bind(...bParams).all();
                result = anyRes;
                break;

            case 'secure_fetch_phc':
                if (user.role !== 'admin' && !user.view_transit && user.transit_access === 'none') throw new Error("Acesso negado a dados Transit/PHC.");
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
                const tName = params.p_table_name;
                const { results: pragmaRes } = await db.prepare(`PRAGMA table_info(${tName})`).all();
                result = pragmaRes.map(col => ({ column_name: col.name }));
                break;

            case 'secure_batch_import':
                const targetTable = params.p_target;
                const itemsToInsert = params.p_items;
                for (const item of itemsToInsert) {
                    const keys = Object.keys(item);
                    const bindings = keys.map(() => '?').join(', ');
                    const vals = keys.map(k => item[k]);
                    await db.prepare(`INSERT INTO ${targetTable} (${keys.join(', ')}) VALUES (${bindings})`).bind(...vals).run();
                }
                result = itemsToInsert.length;
                break;

            case 'secure_fetch_logistics':
                const { results: logRes } = await db.prepare("SELECT * FROM logistics_items WHERE is_deleted = 0 ORDER BY status DESC, id DESC").all();
                result = logRes;
                break;

            case 'secure_fetch_history':
                const limit = params.p_limit || 1000;
                const { results: moveResList } = await db.prepare("SELECT m.*, p.name as product_name FROM movements m LEFT JOIN products p ON m.product_id = p.id ORDER BY m.created_at DESC LIMIT ?").bind(limit).all();
                result = moveResList;
                break;

            case 'secure_fetch_audit_history':
                const auditLimit = params.p_limit || 500;
                const { results: auditRes } = await db.prepare("SELECT * FROM historico_geral ORDER BY criado_em DESC LIMIT ?").bind(auditLimit).all();
                result = auditRes;
                break;

            case 'secure_update_logistics_item':
                const ulData = params.p_data;
                const updateSets = [];
                const updateParams = [];
                for (const key of Object.keys(ulData)) {
                    updateSets.push(`${key} = ?`);
                    updateParams.push(ulData[key]);
                }
                updateParams.push(params.p_id);
                if (updateSets.length > 0) {
                    await db.prepare(`UPDATE logistics_items SET ${updateSets.join(', ')} WHERE id = ?`).bind(...updateParams).run();
                }
                result = params.p_id;
                break;

            case 'secure_manage_logistics':
                const action = params.p_action;
                const mData = params.p_data || {};
                const procList = params.p_process;

                if (action === 'ship') {
                    await db.prepare("UPDATE logistics_items SET status = 'shipped', shipped_by = ?, shipped_at = ?, shipment_id = ?, carrier = ?, box_dimensions = ?, box_image_url = ? WHERE sales_process = ? AND status = 'received'")
                        .bind(mData.shipped_by, mData.shipped_at, mData.shipment_id, mData.carrier, mData.box_dimensions, mData.box_image_url, procList).run();
                } else if (action === 'undo_ship') {
                    if (mData.shipment_id) {
                        await db.prepare("UPDATE logistics_items SET status = 'received', shipped_by = null, shipped_at = null, shipment_id = null, carrier = null, box_dimensions = null, box_image_url = null WHERE shipment_id = ?").bind(mData.shipment_id).run();
                    } else {
                        await db.prepare("UPDATE logistics_items SET status = 'received', shipped_by = null, shipped_at = null, shipment_id = null, carrier = null, box_dimensions = null, box_image_url = null WHERE sales_process = ? AND status = 'shipped'").bind(procList).run();
                    }
                } else if (action === 'delete') {
                    await db.prepare("UPDATE logistics_items SET is_deleted = 1 WHERE sales_process = ?").bind(procList).run();
                } else if (action === 'change_urgency') {
                    await db.prepare("UPDATE logistics_items SET urgency_level = ? WHERE sales_process = ?").bind(mData.urgency_level, procList).run();
                }
                result = true;
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
