function toInt(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function clampPercent(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, value));
}

function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function getEnvValue(env, names = []) {
    for (const name of names) {
        if (env?.[name]) return env[name];
    }
    return '';
}

function formatDateOnly(value) {
    return formatDate(value).slice(0, 10);
}

async function getD1StorageBytes(db) {
    try {
        const pageCount = await db.prepare('PRAGMA page_count;').first();
        const pageSize = await db.prepare('PRAGMA page_size;').first();
        return toInt(pageCount?.page_count) * toInt(pageSize?.page_size);
    } catch {
        return 0;
    }
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const json = await response.json().catch(() => null);
    if (!response.ok) {
        const message = json?.errors?.[0]?.message || json?.error || response.statusText;
        throw new Error(message || `HTTP ${response.status}`);
    }
    return json;
}

async function fetchCloudflareGraphQL(accountId, apiToken, query, variables) {
    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query, variables })
    });

    const json = await response.json().catch(() => null);
    if (!response.ok || json?.errors?.length) {
        const message = json?.errors?.[0]?.message || response.statusText || 'Cloudflare GraphQL error';
        throw new Error(message);
    }

    return json?.data || null;
}

async function getR2Usage(accountId, apiToken) {
    if (!accountId || !apiToken) return { sizeBytes: 0, objects: 0 };

    const headers = {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
    };

    const listed = await fetchJson(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`, {
        headers
    });

    const buckets = listed?.result?.buckets || listed?.result || [];
    let sizeBytes = 0;
    let objects = 0;

    for (const bucket of buckets) {
        if (!bucket?.name) continue;
        try {
            const usage = await fetchJson(
                `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${encodeURIComponent(
                    bucket.name
                )}/usage`,
                { headers }
            );
            const stats = usage?.result || {};
            sizeBytes += toInt(stats.payloadSize) + toInt(stats.metadataSize);
            objects += toInt(stats.objectCount);
        } catch {
            continue;
        }
    }

    return { sizeBytes, objects };
}

function buildMetric(label, usage, limit, unit, period) {
    const current = toInt(usage);
    const ceiling = Math.max(1, toInt(limit));
    const percentage = clampPercent((current / ceiling) * 100);
    const formatBytes = value => {
        if (!Number.isFinite(value) || value <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
        const scaled = value / 1024 ** exponent;
        return `${scaled >= 10 || exponent === 0 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[exponent]}`;
    };
    const formatNumber = value => new Intl.NumberFormat('pt-PT').format(value);

    return {
        label,
        current,
        limit: ceiling,
        currentLabel: unit === 'bytes' ? formatBytes(current) : formatNumber(current),
        limitLabel: unit === 'bytes' ? formatBytes(ceiling) : formatNumber(ceiling),
        unit,
        period,
        percentage
    };
}

export async function onRequest({ env }) {
    const db = env.DB;
    if (!db) {
        return new Response(JSON.stringify({ error: "Database binding 'DB' not found." }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const accountId = getEnvValue(env, ['CF_ACCOUNT_ID', 'CLOUDFLARE_ACCOUNT_ID']).trim();
        const apiToken = getEnvValue(env, ['CF_API_TOKEN', 'CLOUDFLARE_API_TOKEN']).replace(/\s+/g, '');
        const hasTokens = !!(accountId && apiToken);

        const now = new Date();
        const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const [d1StorageBytes, r2Usage] = await Promise.all([
            getD1StorageBytes(db),
            getR2Usage(accountId, apiToken)
        ]);
        let d1RowsRead = 0;
        let d1RowsWritten = 0;
        let d1ReadQueries = 0;
        let d1WriteQueries = 0;

        if (hasTokens) {
            const query = `
                query UsageMetrics(
                    $accountTag: string!,
                    $startDate: Date,
                    $endDate: Date,
                    $startDatetime: string,
                    $endDatetime: string
                ) {
                    viewer {
                        accounts(filter: { accountTag: $accountTag }) {
                            d1AnalyticsAdaptiveGroups(
                                limit: 10000,
                                filter: { date_geq: $startDate, date_leq: $endDate }
                            ) {
                                sum {
                                    readQueries
                                    writeQueries
                                    rowsRead
                                    rowsWritten
                                }
                            }
                        }
                    }
                }
            `;

            try {
                const data = await fetchCloudflareGraphQL(accountId, apiToken, query, {
                    accountTag: accountId,
                    startDate: formatDateOnly(start),
                    endDate: formatDateOnly(now)
                });

                const account = data?.viewer?.accounts?.[0];
                const d1Rows = account?.d1AnalyticsAdaptiveGroups || [];

                d1RowsRead = d1Rows.reduce((sum, row) => sum + toInt(row?.sum?.rowsRead), 0);
                d1RowsWritten = d1Rows.reduce((sum, row) => sum + toInt(row?.sum?.rowsWritten), 0);
                d1ReadQueries = d1Rows.reduce((sum, row) => sum + toInt(row?.sum?.readQueries), 0);
                d1WriteQueries = d1Rows.reduce((sum, row) => sum + toInt(row?.sum?.writeQueries), 0);
            } catch (error) {
                console.warn('[usage] Cloudflare analytics unavailable:', error?.message || error);
            }
        }

        const metrics = [
            buildMetric('Rows lidas 24h', d1RowsRead, 5000000, 'rows', '24h'),
            buildMetric('Rows escritas 24h', d1RowsWritten, 100000, 'rows', '24h'),
            buildMetric('Read queries 24h', d1ReadQueries, 5000000, 'rows', '24h'),
            buildMetric('Write queries 24h', d1WriteQueries, 100000, 'rows', '24h'),
            buildMetric('Storage R2', r2Usage.sizeBytes, 10 * 1024 * 1024 * 1024, 'bytes', 'total')
        ].sort((a, b) => b.percentage - a.percentage);

        return new Response(
            JSON.stringify({
                timestamp: new Date().toISOString(),
                plan: {
                    label: hasTokens ? 'Cloudflare Free' : 'Cloudflare'
                },
                metrics,
                hasTokens
            }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
