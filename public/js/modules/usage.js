import { views } from './dom.js';
import { state } from './state.js';

export async function loadUsageView() {
    // Check if admin (just to be safe)
    if (state.currentUser?.role !== 'admin') {
        const { navigateTo } = await import('./views.js');
        navigateTo('dashboard');
        return;
    }

    // Set Loading State
    views.usage.innerHTML = `
        <div style="padding: 3rem; text-align: center; animation: fadeIn 0.4s ease-out;">
            <div class="spinner" style="margin: 0 auto 1.5rem;"></div>
            <h2 style="color: var(--text-primary); font-size: 1.5rem; font-weight: 700;">A Analisar Consumo Web...</h2>
            <p style="color: var(--text-secondary);">A carregar dados do Cloudflare Free Tier...</p>
        </div>
    `;

    try {
        const response = await fetch('/api/usage');
        const data = await (response.ok ? response.json() : null);

        if (!data) throw new Error('Falha de resposta do servidor da API de usage.');

        renderUsageDashboard(data);
    } catch (error) {
        console.error('Usage fetch error:', error);
    }
}

function renderUsageDashboard(data) {
    const supa = data?.supabase || {};
    const verc = data?.vercel || {};

    const isSupabaseConfigured = supa.status && supa.status !== 'unconfigured';
    const isVercelConfigured = verc.status && verc.status !== 'unconfigured';

    // Minimal Table Layout Styles
    const styles = `
        <style>
            .usage-dashboard {
                max-width: 900px;
                margin: 0 auto;
                animation: fadeIn 0.4s ease-out;
            }
            .usage-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 2rem;
            }
            .usage-header h1 {
                font-size: 1.5rem;
                font-weight: 700;
                color: var(--text-primary);
                margin: 0;
            }
            .cycle-badge {
                font-size: 0.8rem;
                color: var(--text-secondary);
                background: rgba(0,0,0,0.05);
                padding: 6px 12px;
                border-radius: 6px;
                border: 1px solid var(--border-color);
            }
            .usage-table-container {
                background: var(--bg-color);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
            }
            .usage-table {
                width: 100%;
                border-collapse: collapse;
            }
            .usage-table th {
                text-align: left;
                padding: 1rem 1.5rem;
                font-size: 0.75rem;
                font-weight: 600;
                color: var(--text-secondary);
                text-transform: uppercase;
                letter-spacing: 0.5px;
                border-bottom: 1px solid var(--border-color);
                background: rgba(0,0,0,0.02);
            }
            .usage-table th:last-child {
                text-align: right;
            }
            .usage-table td {
                padding: 1rem 1.5rem;
                font-size: 0.9rem;
                color: var(--text-primary);
                border-bottom: 1px solid var(--border-color);
                font-weight: 500;
                vertical-align: middle;
            }
            .usage-table tr:last-child td {
                border-bottom: none;
            }
            .usage-table tr:hover {
                background: rgba(0,0,0,0.015);
            }
            .metric-name-cell {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            .progress-ring {
                width: 20px;
                height: 20px;
                transform: rotate(-90deg);
            }
            .progress-ring-bg {
                fill: none;
                stroke: rgba(0,0,0,0.1);
                stroke-width: 4;
            }
            .progress-ring-circle {
                fill: none;
                stroke: #3b82f6;
                stroke-width: 4;
                stroke-linecap: round;
                transition: stroke-dashoffset 0.5s ease-in-out;
            }
            :root[data-theme="dark"] .progress-ring-bg { stroke: rgba(255,255,255,0.1); }

            .usage-value {
                text-align: right;
                font-family: 'Inter', monospace;
                color: var(--text-primary);
            }
            .usage-limit {
                color: var(--text-secondary);
                font-weight: 400;
                margin-left: 4px;
            }
            
            .unconfigured-notice {
                background: #fffbeb;
                border: 1px dashed #fbbf24;
                border-radius: 8px;
                padding: 1rem;
                margin-bottom: 2rem;
                color: #b45309;
                font-size: 0.85rem;
            }
        </style>
    `;

    // --- Helpers Formatters ---
    const formatBytes = (bytes, decimals = 2) => {
        if (!+bytes) return '0 Bytes';
        const k = 1000; // Vercel and generic network often uses 1000
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    };

    const formatNumber = (num, unit = '') => {
        if (!num) return '0' + unit;
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M' + unit;
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K' + unit;
        return new Intl.NumberFormat('pt-PT').format(num) + unit;
    };

    let errorBanner = '';
    const hasTokens = data?.config?.hasTokens || false;

    if (!hasTokens) {
        errorBanner = `
            <div class="unconfigured-notice" style="background:#f8fafc; border-color:#cbd5e1; color:#475569;">
                <i class="fa-solid fa-key" style="margin-right:8px; color:var(--primary-color);"></i> 
                <strong>Métricas limitadas.</strong> Atribua as chaves <code>CF_ACCOUNT_ID</code> e <code>CF_API_TOKEN</code> nas variáveis de ambiente da Cloudflare para monitorização completa.
            </div>
        `;
    }

    // Extended metrics list with real data where possible
    const d1Size = data?.d1?.sizeBytes || 0;

    // Default to '--' visually if lacking tokens, unless it's a metric we can fetch without tokens (like D1 size!)
    const renderVal = (val, asBytes) => {
        if (!hasTokens && val === 0) return '--';
        return asBytes ? formatBytes(val) : formatNumber(val);
    };

    // Note: D1 size is fetched locally from the SQLite Pragma, so it works even without API tokens!
    const d1VisualValue = d1Size > 0 ? formatBytes(d1Size) : '--';

    const r2Size = data?.r2?.sizeBytes || 0;
    const r2Objects = data?.r2?.objects || 0;

    const metricsList = [
        { name: 'Database Storage (D1 Atual)', rawValue: d1Size, rawLimit: 5 * 1000 * 1000 * 1000, value: d1VisualValue, limit: '5 GB', isBytes: true },
        { name: 'Storage Size (R2 Cloud)', rawValue: r2Size, rawLimit: 10 * 1000 * 1000 * 1000, value: renderVal(r2Size, true), limit: '10 GB', isBytes: true },
        { name: 'Total Objects (R2 Cloud)', rawValue: r2Objects, rawLimit: 1000000, value: renderVal(r2Objects, false), limit: '1M Ops/Mês', isBytes: false },
        { name: 'Fast Data Transfer', rawValue: 0, rawLimit: 100 * 1000 * 1000 * 1000, value: renderVal(0, true), limit: '100 GB', isBytes: true },
        { name: 'Fast Origin Transfer', rawValue: 0, rawLimit: 10 * 1000 * 1000 * 1000, value: renderVal(0, true), limit: '10 GB', isBytes: true },
        { name: 'Edge Requests', rawValue: 0, rawLimit: 100000, value: renderVal(0, false), limit: '100K', isBytes: false },
        { name: 'Observability events', rawValue: 0, rawLimit: 200000, value: renderVal(0, false), limit: '200K', isBytes: false },
        { name: 'Workers build minutes', rawValue: 0, rawLimit: 3000, value: renderVal(0, false), limit: '3,000', isBytes: false },
        { name: 'Database Queries (D1)', rawValue: 0, rawLimit: 100000, value: renderVal(0, false), limit: '100K', isBytes: false }
    ];

    // Calculate percentages and sort descending
    metricsList.forEach(m => {
        m.percentage = m.rawLimit > 0 ? (m.rawValue / m.rawLimit) * 100 : 0;
        if (m.percentage > 100) m.percentage = 100; // Cap visual at 100%
    });

    metricsList.sort((a, b) => b.percentage - a.percentage);

    const generateProgressRing = (percentage) => {
        const radius = 8;
        const circumference = radius * 2 * Math.PI;
        // The stroke-dasharray expects "length, gap", stroke-dashoffset subtracts from length
        const offset = circumference - (percentage / 100) * circumference;

        let strokeColor = '#3b82f6'; // Blue
        if (percentage >= 80) strokeColor = '#ef4444'; // Red
        else if (percentage >= 50) strokeColor = '#f59e0b'; // Yellow/Orange

        return `<svg class="progress-ring" viewBox="0 0 20 20">
            <circle class="progress-ring-bg" cx="10" cy="10" r="${radius}"></circle>
            <circle class="progress-ring-circle" stroke="${strokeColor}" cx="10" cy="10" r="${radius}" 
                stroke-dasharray="${circumference} ${circumference}" 
                stroke-dashoffset="${offset}"></circle>
        </svg>`;
    };

    const rowsHtml = metricsList.map(m => `
        <tr>
            <td>
                <div class="metric-name-cell">
                    ${generateProgressRing(m.percentage)}
                    <span>${m.name}</span>
                </div>
            </td>
            <td class="usage-value">
                ${m.value} <span class="usage-limit">/ ${m.limit}</span>
                <span style="font-size: 0.75rem; color: ${m.percentage > 80 ? '#ef4444' : 'var(--text-secondary)'}; margin-left: 8px; font-weight: 600;">
                    (${m.percentage.toFixed(1)}%)
                </span>
            </td>
        </tr>
    `).join('');

    views.usage.innerHTML = `
        ${styles}
        <div class="usage-dashboard">
            <div class="usage-header">
                <h1>Cloudflare Free Tier Limits</h1>
                <div class="cycle-badge">
                    <i class="regular fa-calendar" style="margin-right: 6px;"></i> Referência (Plano Gratuito)
                </div>
            </div>
            
            ${errorBanner}

            <div class="usage-table-container">
                <table class="usage-table">
                    <thead>
                        <tr>
                            <th>Feature</th>
                            <th>Free Tier Limit</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>

            <div style="margin-top: 1.5rem; color: var(--text-secondary); font-size: 0.75rem; display: flex; justify-content: space-between;">
                <span>* Powered by Cloudflare Platform Analytics</span>
                <span>Última Verificação: ${new Date(data?.timestamp || Date.now()).toLocaleString('pt-PT')}</span>
            </div>
        </div>
    `;
}
