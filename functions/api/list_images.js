export async function onRequestGet({ env }) {
    try {
        const bucket = env.BACKUP_BUCKET;
        if (!bucket) return new Response(JSON.stringify({ error: 'R2 bucket binding not configured' }), { status: 500 });

        // List all objects (may be large) - for staging it's acceptable; production may need pagination
        const listed = await bucket.list();
        const objs = (listed.objects || []).map(o => ({ key: o.key, size: o.size, uploaded: o.uploaded }));

        // Try to enrich with DB attachments/products if DB binding available
        try {
            const db = env.DB;
            if (db) {
                // Fetch attachments joined with products to map URLs to products and processes
                const q = `SELECT a.id as attachment_id, a.product_id, a.url, a.file_type, a.sort_order, p.name as product_name, p.part_number, p.sales_process FROM attachments a LEFT JOIN products p ON p.id = a.product_id`;
                const { results } = await db.prepare(q).all();
                const attachments = results || [];

                // Build map by basename -> attachments[] and by full url
                const byBase = new Map();
                const byUrl = new Map();
                attachments.forEach(a => {
                    try {
                        const url = a.url || '';
                        const base = url.split('/').pop();
                        if (base) {
                            const arr = byBase.get(base) || [];
                            arr.push(a);
                            byBase.set(base, arr);
                        }
                        byUrl.set(url, a);
                    } catch (e) { }
                });

                // Attach matching metadata to objs
                objs.forEach(obj => {
                    const base = obj.key.split('/').pop();
                    // Prefer exact url match
                    let match = byUrl.get(obj.key);
                    if (!match) match = (byBase.get(base) || [])[0];
                    if (match) {
                        obj.product_id = match.product_id;
                        obj.product_name = match.product_name;
                        obj.part_number = match.part_number;
                        obj.sales_process = match.sales_process;
                        obj.attachment_id = match.attachment_id;
                        obj.sort_order = match.sort_order;
                    }
                });
            }
        } catch (e) {
            // Non-fatal: if DB query fails, still return plain list
            console.warn('list_images: db enrich failed', e.message || e);
        }

        return new Response(JSON.stringify(objs), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
