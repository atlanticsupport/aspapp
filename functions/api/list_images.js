export async function onRequestGet({ env }) {
    try {
        const bucket = env.BACKUP_BUCKET;
        if (!bucket) return new Response(JSON.stringify({ error: 'R2 bucket binding not configured' }), { status: 500 });

        // List all objects (may be large) - for staging it's acceptable; production may need pagination
        const listed = await bucket.list();
        const objs = (listed.objects || []).map(o => ({ key: o.key, size: o.size, uploaded: o.uploaded }));

        return new Response(JSON.stringify(objs), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
