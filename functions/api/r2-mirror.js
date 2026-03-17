export async function onRequestPost({ request, env }) {
    try {
        const body = await request.json();
        const { fileName, fileContentBase64, contentType } = body;

        if (!fileName || !fileContentBase64) {
            return new Response(JSON.stringify({ error: 'Missing required fields' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Strip data URI string if present
        const base64Data = fileContentBase64.includes(',')
            ? fileContentBase64.split(',')[1]
            : fileContentBase64;

        // Convert Base64 to Uint8Array natively for Cloudflare Workers (no Buffer)
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // Escreve diretamente no Bucket via Bindings da própria Cloudflare!
        // Não é necessária NENHUMA library externa AWS!
        if (!env.BACKUP_BUCKET) {
            console.error('BACKUP_BUCKET binding missing');
            return new Response(JSON.stringify({ error: 'BACKUP_BUCKET not found' }), { status: 500 });
        }

        await env.BACKUP_BUCKET.put(fileName, bytes, {
            httpMetadata: { contentType: contentType || 'image/webp' }
        });

        return new Response(JSON.stringify({ success: true, message: 'Image mirrored to R2 natively', fileName }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('[R2 Backup Error]:', error);
        return new Response(JSON.stringify({ error: 'Failed to mirror image to R2', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
