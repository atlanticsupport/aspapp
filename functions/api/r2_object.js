export async function onRequestGet({ request, env }) {
    try {
        const url = new URL(request.url);
        const key = url.searchParams.get('key');
        if (!key) return new Response('Missing key', { status: 400 });

        const bucket = env.BACKUP_BUCKET;
        if (!bucket) return new Response('Bucket not configured', { status: 500 });

        const file = await bucket.get(key);
        if (!file) return new Response('Not found', { status: 404 });

        const resp = new Response(file.body);
        if (file.httpMetadata && file.httpMetadata.contentType) resp.headers.set('Content-Type', file.httpMetadata.contentType);
        return resp;
    } catch (e) {
        return new Response(e.message || 'Error', { status: 500 });
    }
}
