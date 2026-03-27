export async function onRequestGet({ request, env }) {
    try {
        const url = new URL(request.url);
        const key = url.searchParams.get('key');
        const w = parseInt(url.searchParams.get('w')) || 64;
        const h = parseInt(url.searchParams.get('h')) || w;
        const quality = parseInt(url.searchParams.get('q')) || 60;

        if (!key) return new Response('Missing key', { status: 400 });
        const bucket = env.BACKUP_BUCKET;
        if (!bucket) return new Response('Bucket not configured', { status: 500 });

        const file = await bucket.get(key);
        if (!file) return new Response('Not found', { status: 404 });

        const headers = new Headers();
        if (file.httpMetadata && file.httpMetadata.contentType) headers.set('Content-Type', file.httpMetadata.contentType);
        headers.set('Cache-Control', 'public, max-age=604800');

        // Use Cloudflare Image Resizing at the edge by setting the cf.image transform on the response
        const cfOpts = { image: { width: w, height: h, fit: 'cover', quality } };
        return new Response(file.body, { status: 200, headers, cf: cfOpts });
    } catch (e) {
        return new Response(e.message || 'Error', { status: 500 });
    }
}
