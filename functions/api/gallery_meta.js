export async function onRequestGet({ env }) {
    try {
        const db = env.DB;
        if (!db) return new Response(JSON.stringify({ error: 'DB binding not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

        const q = `SELECT a.id as attachment_id, a.product_id, a.url, a.file_type, a.sort_order, p.name as product_name, p.part_number, p.sales_process
                   FROM attachments a LEFT JOIN products p ON p.id = a.product_id`;
        const { results } = await db.prepare(q).all();
        const attachments = results || [];

        const byBase = {};
        const byUrl = {};
        attachments.forEach(a => {
            const url = a.url || '';
            // Normalize base name: if URL uses a query like ?name=product-..., extract the name param
            let base = url.split('/').pop() || '';
            const nameIdx = base.indexOf('name=');
            if (nameIdx !== -1) {
                base = base.substring(nameIdx + 5);
            }
            // Also handle cases where entire path contains '?name=' earlier
            if (!base && url.includes('?name=')) {
                const parts = url.split('?name=');
                base = parts.length > 1 ? parts[1].split('&')[0] : '';
            }
            // fallback: if still looks like file?name=..., try to remove prefix
            if (base.startsWith('file?name=')) base = base.replace(/^file\?name=/, '');
            if (base) {
                byBase[base] = byBase[base] || [];
                byBase[base].push({ attachment_id: a.attachment_id, product_id: a.product_id, product_name: a.product_name, part_number: a.part_number, sales_process: a.sales_process, sort_order: a.sort_order, url: a.url, file_type: a.file_type });
            }
            if (url) byUrl[url] = { attachment_id: a.attachment_id, product_id: a.product_id, product_name: a.product_name, part_number: a.part_number, sales_process: a.sales_process, sort_order: a.sort_order, url: a.url, file_type: a.file_type };
        });

        return new Response(JSON.stringify({ byBase, byUrl }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message || e }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
