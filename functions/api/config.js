export async function onRequest(context) {
    return new Response(JSON.stringify({
        supabaseUrl: context.env.SUPABASE_URL,
        supabaseKey: context.env.SUPABASE_ANON_KEY,
    }), {
        status: 200,
        headers: {
            "Content-Type": "application/json"
        }
    });
}
