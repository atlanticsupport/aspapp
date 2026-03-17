export async function onRequest(context) {
    const { env } = context;
    const accountId = env.CF_ACCOUNT_ID;
    const apiToken = env.CF_API_TOKEN;

    let responseData = {
        config: { hasTokens: !!(accountId && apiToken) },
        d1: { sizeBytes: 0, queries: 0 },
        r2: { sizeBytes: 0, objects: 0 },
        workers: { requests: 0, invocations: 0 }
    };

    try {
        // 1. Fetch Real Cloudflare Metrics if Tokens available
        if (accountId && apiToken) {
            const headers = {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            };

            // a. D1 Usage
            try {
                const d1Res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`, { headers });
                if (d1Res.ok) {
                    const d1Data = await d1Res.json();
                    let totalD1Size = 0;
                    const databases = d1Data.result || [];
                    for (const db of databases) {
                        totalD1Size += parseInt(db.file_size || 0);
                    }
                    responseData.d1.sizeBytes = totalD1Size;
                }
            } catch (d1Err) {
                console.error("D1 Fetch Error:", d1Err);
            }

            try {
                const bucketsRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`, { headers });
                if (bucketsRes.ok) {
                    const bucketsData = await bucketsRes.json();
                    const buckets = bucketsData.result?.buckets || [];

                    let totalR2Size = 0;
                    let totalR2Objects = 0;

                    // Sum Usage from each bucket
                    for (const b of buckets) {
                        const usageRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${b.name}/usage`, { headers });
                        if (usageRes.ok) {
                            const usageData = await usageRes.json();
                            const stats = usageData.result;
                            if (stats) {
                                totalR2Size += parseInt(stats.payloadSize || 0) + parseInt(stats.metadataSize || 0);
                                totalR2Objects += parseInt(stats.objectCount || 0);
                            }
                        }
                    }

                    responseData.r2.sizeBytes = totalR2Size;
                    responseData.r2.objects = totalR2Objects;
                    responseData.r2.status = "Ativo";
                }
            } catch (r2Err) {
                console.error("R2 Usage Fetch Error:", r2Err);
            }

            // b. Workers/Pages Requests via GraphQL Analytics
            responseData.workers.status = "API Ligada";
        }

        return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
}
