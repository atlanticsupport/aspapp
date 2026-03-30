function normalizeAttachmentKey(url = '') {
    const raw = String(url || '').trim();
    if (!raw) return '';

    try {
        const parsed = new URL(raw, 'https://example.invalid');
        const name = parsed.searchParams.get('name');
        if (name) return decodeURIComponent(name);
        const last = parsed.pathname.split('/').pop() || '';
        return last ? decodeURIComponent(last) : '';
    } catch {
        const nameMatch = raw.match(/[?&]name=([^&]+)/);
        if (nameMatch) return decodeURIComponent(nameMatch[1]);
        const last = raw.split('/').pop() || raw;
        if (last.startsWith('file?name=')) return decodeURIComponent(last.slice(10).split('&')[0]);
        return last;
    }
}

export async function onRequestGet({ env }) {
    try {
        const bucket = env.BACKUP_BUCKET;
        if (!bucket) {
            return new Response(JSON.stringify({ error: 'R2 bucket binding not configured' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const listed = await bucket.list();
        const bucketObjects = new Map(
            (listed.objects || []).map(object => [
                object.key,
                { key: object.key, size: object.size, uploaded: object.uploaded }
            ])
        );

        const db = env.DB;
        if (!db) {
            return new Response(JSON.stringify([...bucketObjects.values()]), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const query = `
            SELECT
                a.id AS attachment_id,
                a.product_id,
                a.url,
                a.file_type,
                a.category,
                a.sort_order,
                p.name AS product_name,
                p.part_number,
                p.sales_process,
                p.is_deleted
            FROM attachments a
            INNER JOIN products p ON p.id = a.product_id
            WHERE a.file_type = 'image'
                AND a.category = 'product'
                AND COALESCE(p.is_deleted, 0) = 0
            ORDER BY COALESCE(p.sales_process, ''), COALESCE(p.name, ''), COALESCE(a.sort_order, 0), a.id
        `;

        const { results } = await db.prepare(query).all();
        const attachments = results || [];
        const output = [];

        attachments.forEach(att => {
            const key = normalizeAttachmentKey(att.url);
            const bucketObject = bucketObjects.get(key);
            if (!bucketObject) return;

            output.push({
                key: bucketObject.key,
                size: bucketObject.size,
                uploaded: bucketObject.uploaded,
                attachment_id: att.attachment_id,
                product_id: att.product_id,
                product_name: att.product_name,
                part_number: att.part_number,
                sales_process: att.sales_process,
                sort_order: att.sort_order,
                category: att.category || 'product',
                file_type: att.file_type || 'image'
            });
        });

        return new Response(JSON.stringify(output), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message || String(e) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
