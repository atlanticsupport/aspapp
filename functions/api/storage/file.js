export async function onRequestGet({ request, env }) {
    try {
        const url = new URL(request.url);
        const fileName = url.searchParams.get('name');
        if (!fileName) return new Response('Not Found', { status: 404 });

        const object = await env.BACKUP_BUCKET.get(fileName);
        if (object === null) {
            return new Response('File Not Found', { status: 404 });
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);

        return new Response(object.body, {
            headers,
        });

    } catch (e) {
        return new Response('Error Loading Image', { status: 500 });
    }
}
