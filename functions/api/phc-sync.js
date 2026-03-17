// CLOUDFLARE PAGES - ENDPOINT DE SINCRONIZAÇÃO PHC (ACEITA POSTS DO PYTHON)
export async function onRequestPost({ request, env }) {
    try {
        // Validação de Segurança Super Simples (API Key da ponte Python)
        const authHeader = request.headers.get('Authorization');
        const VALID_API_KEY = env.PHC_API_KEY || "phc_secret_x2026_asp_ultra_secure"; // Pode alterar ou meter como env var

        if (authHeader !== `Bearer ${VALID_API_KEY}`) {
            return new Response(JSON.stringify({ error: "Acesso Negado à Bridge PHC" }), { status: 401 });
        }

        const body = await request.json();
        const db = env.DB;

        if (!db) throw new Error("A Base de Dados não está ligada.");

        // Extrai os campos vindos do payload Python
        const {
            processo_id,
            cliente_final,
            maker,
            engine_type,
            ship,
            equipment,
            dados_json,
            last_sync
        } = body;

        if (!processo_id) {
            return new Response(JSON.stringify({ error: "Falta o processo_id" }), { status: 400 });
        }

        const jsonString = typeof dados_json === 'object' ? JSON.stringify(dados_json) : dados_json;

        // Upsert Magico do SQLite D1 (Igual ao do Supabase)
        const stmt = db.prepare(`
            INSERT INTO phc (
                processo_id, cliente_final, maker, engine_type, ship, equipment, dados_json, last_sync
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(processo_id) DO UPDATE SET
                cliente_final = excluded.cliente_final,
                maker = excluded.maker,
                engine_type = excluded.engine_type,
                ship = excluded.ship,
                equipment = excluded.equipment,
                dados_json = excluded.dados_json,
                last_sync = excluded.last_sync
        `).bind(
            processo_id,
            cliente_final || null,
            maker || null,
            engine_type || null,
            ship || null,
            equipment || null,
            jsonString,
            last_sync || new Date().toISOString()
        );

        await stmt.run();

        return new Response(JSON.stringify({ success: true, message: `Processo ${processo_id} Sincronizado com D1!` }), { status: 200 });

    } catch (err) {
        console.error("D1 PHC Sync Error:", err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
