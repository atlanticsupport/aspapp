export async function onRequestPost({ request, env }) {
    try {
        const body = await request.json();
        const { bucket, fileName, fileContentBase64 } = body;

        if (!fileName || !fileContentBase64 || !env.BACKUP_BUCKET) {
            return new Response(JSON.stringify({ error: "Missing config or properties" }), { status: 400 });
        }

        const base64Data = fileContentBase64.includes(',') ? fileContentBase64.split(',')[1] : fileContentBase64;
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // We use the universal BACKUP_BUCKET R2 binding to store images.
        // We add Public Access through our own worker.
        await env.BACKUP_BUCKET.put(fileName, bytes, {
            httpMetadata: { contentType: fileName.endsWith('.pdf') ? 'application/pdf' : 'image/webp' }
        });

        return new Response(JSON.stringify({
            success: true,
            data: { path: fileName }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
