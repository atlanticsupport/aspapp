// Auto-Backup da Base de Dados - 30 Dias de Retenção
// Chamada externa recomendada: GET /api/secure_backup?token=SUA_CHAVE_AQUI (Via UptimeRobot, cron-job.org ou outro trigger)

export async function onRequestGet({ request, env }) {
    try {
        const url = new URL(request.url);
        const token = url.searchParams.get('token');
        const expectedToken = env.BACKUP_TOKEN || 'CHAVE_SEC_ASP_2026_CRON_BACKUP_DEFAULT';

        if (token !== expectedToken) {
            return new Response(JSON.stringify({ error: "Unauthorized access completely forbidden." }), { status: 401 });
        }

        const db = env.DB;
        const bucket = env.BACKUP_BUCKET;

        if (!db || !bucket) {
            return new Response(JSON.stringify({ error: "System bindings missing for DB or Storage." }), { status: 500 });
        }

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const fileName = `db-backups/aspstock_backup_${dateStr}.json`;

        // Extraimos todas as tabelas (sem phc, porque o phc sincroniza de fora, e é enorme)
        // Apenas preservamos CORE STATE: Products, Users, Movements, Historico_Geral, Logistics, Attachments.
        const tables = ['app_users', 'products', 'movements', 'historico_geral', 'logistics_items', 'attachments'];
        let dump = { timestamp: now.toISOString(), tables: {} };

        for (const t of tables) {
            const { results } = await db.prepare(`SELECT * FROM ${t}`).all();
            dump.tables[t] = results;
        }

        const jsonData = JSON.stringify(dump);

        // Compressão opcional e Conversão para Uint8Array
        const encoder = new TextEncoder();
        const byteData = encoder.encode(jsonData);

        // Grava no R2
        await bucket.put(fileName, byteData, {
            httpMetadata: { contentType: 'application/json' }
        });

        // Loop de Gestão de Retenção a 30 Dias Programado Automaticamente
        // Vai buscar lista de backups na pasta db-backups/
        const thirtyDaysAgo = now.getTime() - (30 * 24 * 60 * 60 * 1000);
        let listed = await bucket.list({ prefix: 'db-backups/' });

        const deletedFiles = [];
        for (const file of listed.objects) {
            if (file.uploaded.getTime() < thirtyDaysAgo) {
                await bucket.delete(file.key);
                deletedFiles.push(file.key);
            }
        }

        return new Response(JSON.stringify({
            success: true,
            message: `Snapshot completo exportado para: ${fileName}`,
            bytes: byteData.length,
            deleted_old_backups: deletedFiles
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (e) {
        console.error("Backup Fail:", e);
        return new Response(JSON.stringify({ error: "System Integrity Output Failed: " + e.message }), { status: 500 });
    }
}
