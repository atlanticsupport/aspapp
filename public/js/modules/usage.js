import { views } from './core/dom.js';
import { state } from './core/state.js';

let usageChart = null;

function fmtDate(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat('pt-PT', {
        dateStyle: 'short',
        timeStyle: 'short'
    }).format(d);
}

function getBarColor(percentage) {
    if (percentage >= 80) return '#dc2626';
    if (percentage >= 50) return '#d97706';
    if (percentage >= 20) return '#2563eb';
    return '#0f766e';
}

function ensureChartJs() {
    if (window.Chart) return Promise.resolve(window.Chart);

    return new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-usage-chart="true"]');
        if (existing) {
            existing.addEventListener('load', () => resolve(window.Chart), { once: true });
            existing.addEventListener('error', reject, { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js';
        script.dataset.usageChart = 'true';
        script.onload = () => resolve(window.Chart);
        script.onerror = () => reject(new Error('Falha ao carregar o gráfico.'));
        document.head.appendChild(script);
    });
}

export async function loadUsageView() {
    if (state.currentUser?.role !== 'admin') {
        const { navigateTo } = await import('./views.js');
        navigateTo('dashboard');
        return;
    }

    views.usage.innerHTML = `
        <div style="padding: 3rem; text-align: center;">
            <div class="spinner" style="margin: 0 auto 1rem;"></div>
            <h2 style="margin:0 0 .5rem;">A carregar uso Cloudflare...</h2>
            <p style="color: var(--text-secondary);">A preparar métricas do teu tier.</p>
        </div>
    `;

    try {
        const response = await fetch('/api/usage');
        const data = response.ok ? await response.json() : null;
        if (!data || data.error) throw new Error(data?.error || 'Falha ao carregar métricas.');
        renderUsageDashboard(data);
    } catch (error) {
        views.usage.innerHTML = `
            <div style="padding: 3rem; max-width: 760px; margin: 0 auto;">
                <div class="card" style="padding: 1.5rem;">
                    <h2 style="margin-top:0;">Uso indisponível</h2>
                    <p style="color: var(--text-secondary); margin-bottom:1rem;">${error.message}</p>
                    <button class="btn btn-primary" onclick="window.navigateTo('usage')">Tentar novamente</button>
                </div>
            </div>
        `;
    }
}

async function renderUsageDashboard(data) {
    await ensureChartJs();

    const metrics = data.metrics || [];
    const labels = metrics.map(metric => metric.label);
    const values = metrics.map(metric => Number(metric.percentage.toFixed(1)));
    const colors = metrics.map(metric => getBarColor(metric.percentage));

    views.usage.innerHTML = `
        <style>
            .usage-shell {
                max-width: 1100px;
                margin: 0 auto;
                padding: 1.25rem 1.25rem 2rem;
            }
            .usage-top {
                display: flex;
                justify-content: space-between;
                gap: 1rem;
                align-items: start;
                margin-bottom: 1rem;
            }
            .usage-title h1 {
                margin: 0;
                font-size: 1.7rem;
            }
            .usage-title p {
                margin: .25rem 0 0;
                color: var(--text-secondary);
            }
            .usage-actions {
                display: flex;
                align-items: center;
                gap: .75rem;
            }
            .usage-pill {
                display: inline-flex;
                align-items: center;
                padding: .3rem .65rem;
                border-radius: 999px;
                background: #e2e8f0;
                color: #334155;
                font-size: .78rem;
                font-weight: 700;
            }
            .usage-card {
                background: var(--bg-color);
                border: 1px solid var(--border-color);
                border-radius: 16px;
                padding: 1rem;
                box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
            }
            .usage-card-head {
                display: flex;
                justify-content: space-between;
                gap: 1rem;
                align-items: start;
                margin-bottom: .75rem;
            }
            .usage-card-head h2 {
                margin: 0;
                font-size: 1rem;
            }
            .usage-card-head p {
                margin: .2rem 0 0;
                color: var(--text-secondary);
                font-size: .84rem;
            }
            .usage-chart-wrap {
                height: 360px;
            }
            .usage-empty {
                padding: 1rem;
                border: 1px dashed var(--border-color);
                border-radius: 12px;
                color: var(--text-secondary);
            }
            .usage-foot {
                margin-top: .7rem;
                display: flex;
                justify-content: space-between;
                gap: 1rem;
                color: var(--text-secondary);
                font-size: .78rem;
                flex-wrap: wrap;
            }
            @media (max-width: 860px) {
                .usage-top,
                .usage-foot {
                    display: grid;
                }
                .usage-chart-wrap {
                    height: 320px;
                }
            }
        </style>
        <div class="usage-shell">
            <div class="usage-top">
                <div class="usage-title">
                    <h1>Web Usage</h1>
                    <p>Uso real do teu tier Cloudflare, em percentagem.</p>
                </div>
                <div class="usage-actions">
                    <span class="usage-pill">Atualizado: ${fmtDate(data.timestamp)}</span>
                    <button class="btn btn-secondary" onclick="window.navigateTo('usage')">Atualizar</button>
                </div>
            </div>

            <section class="usage-card">
                <div class="usage-card-head">
                    <div>
                        <h2>Utilização do plano</h2>
                <p>${data.plan?.label || 'Cloudflare'} • métricas reais do teu tier</p>
                    </div>
                </div>
                ${metrics.length ? '<div class="usage-chart-wrap"><canvas id="usage-chart"></canvas></div>' : '<div class="usage-empty">Sem métricas com utilização para mostrar.</div>'}
                <div class="usage-foot">
                    <span>Mostra as métricas do plano, incluindo 0%</span>
                    <span>Baseado nas últimas 24h e no storage atual</span>
                </div>
            </section>
        </div>
    `;

    if (!metrics.length) return;

    const canvas = document.getElementById('usage-chart');
    if (!canvas) return;

    if (usageChart) {
        usageChart.destroy();
        usageChart = null;
    }

    usageChart = new window.Chart(canvas, {
        type: 'bar',
        data: {
            labels,
                    datasets: [
                        {
                            data: values,
                            backgroundColor: colors,
                            borderWidth: 0,
                            borderRadius: 10,
                            barThickness: 18,
                            maxBarThickness: 24,
                            minBarLength: 8
                        }
                    ]
                },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label(context) {
                            const metric = metrics[context.dataIndex];
                            return `${metric.currentLabel} / ${metric.limitLabel} (${metric.percentage.toFixed(1)}%)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: value => `${value}%`
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.18)'
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: {
                        color: 'inherit'
                    }
                }
            }
        }
    });
}
