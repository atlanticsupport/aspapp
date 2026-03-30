import { state } from '../core/state.js';
import { supabase } from '../supabase-client.js';
import { showToast, formatCurrency } from '../core/ui.js';
import { views } from '../core/dom.js';

const SCRIPT_CACHE = new Map();
const CHART_JS_URL = 'https://cdn.jsdelivr.net/npm/chart.js';

function loadExternalScript(url) {
    if (SCRIPT_CACHE.has(url)) return SCRIPT_CACHE.get(url);

    const promise = new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${url}"]`);
        if (existing && (existing.dataset.loaded === 'true' || existing.dataset.loaded === '1')) {
            resolve();
            return;
        }

        const script = existing || document.createElement('script');
        const cleanup = () => {
            script.removeEventListener('load', onLoad);
            script.removeEventListener('error', onError);
        };
        const onLoad = () => {
            script.dataset.loaded = 'true';
            cleanup();
            resolve();
        };
        const onError = () => {
            cleanup();
            reject(new Error(`Falha ao carregar ${url}`));
        };

        script.addEventListener('load', onLoad);
        script.addEventListener('error', onError);

        if (!existing) {
            script.src = url;
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);
        }
    });

    SCRIPT_CACHE.set(url, promise);
    return promise;
}

async function ensureChartJs() {
    if (typeof Chart !== 'undefined') return true;
    try {
        await loadExternalScript(CHART_JS_URL);
    } catch (error) {
        return false;
    }
    return typeof Chart !== 'undefined';
}

let isDashboardFetching = false;

const dashboardUiState = {
    periodDays: 30,
    topMetric: 'qty'
};

let dashboardSnapshot = null;

function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function getMovementDate(movement) {
    return parseDate(
        movement.created_at || movement.createdAt || movement.date || movement.moved_at
    );
}

function normalizeMovementType(movement) {
    const raw = String(movement.type || movement.movement_type || '').toUpperCase();
    if (raw === 'OUT' || raw === 'SAIDA' || raw === 'SAIDA') return 'OUT';
    if (raw === 'IN' || raw === 'ENTRADA') return 'IN';
    return Number(movement.quantity || 0) < 0 ? 'OUT' : 'IN';
}

function getFilteredMovements(movements, periodDays) {
    if (!Array.isArray(movements)) return [];
    if (periodDays === 'all') return movements;

    const days = Number(periodDays || 30);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    return movements.filter(movement => {
        const date = getMovementDate(movement);
        return date && date.getTime() >= cutoff;
    });
}

function buildTopMoved(movements, productsById, metric) {
    const agg = {};

    movements.forEach(movement => {
        const product = productsById[movement.product_id] || {};
        const name = movement.product_name || product.name || `ID ${movement.product_id}`;
        const qty = Math.abs(Number(movement.quantity || 0));
        const unitPrice = Number(movement.unit_price || product.cost_price || 0);

        if (!agg[name]) {
            agg[name] = { name, qty: 0, value: 0 };
        }

        agg[name].qty += qty;
        agg[name].value += qty * unitPrice;
    });

    return Object.values(agg)
        .sort((a, b) => (metric === 'value' ? b.value - a.value : b.qty - a.qty))
        .slice(0, 8);
}

function buildTrendSeries(movements, periodDays) {
    const now = new Date();
    const days = periodDays === 'all' ? 30 : Number(periodDays || 30);
    const buckets = {};

    for (let i = days - 1; i >= 0; i--) {
        const day = new Date(now);
        day.setDate(now.getDate() - i);
        const key = day.toISOString().slice(0, 10);
        buckets[key] = { inQty: 0, outQty: 0 };
    }

    movements.forEach(movement => {
        const date = getMovementDate(movement);
        if (!date) return;

        const key = date.toISOString().slice(0, 10);
        if (!buckets[key]) return;

        const qty = Math.abs(Number(movement.quantity || 0));
        if (normalizeMovementType(movement) === 'OUT') buckets[key].outQty += qty;
        else buckets[key].inQty += qty;
    });

    const keys = Object.keys(buckets);
    return {
        labels: keys.map(d => d.slice(5)),
        inData: keys.map(d => buckets[d].inQty),
        outData: keys.map(d => buckets[d].outQty)
    };
}

function buildStockHealth(products) {
    const health = { healthy: 0, low: 0, out: 0 };

    products.forEach(product => {
        const qty = Number(product.quantity || 0);
        const min = Number(product.min_quantity || 0);

        if (qty <= 0) health.out++;
        else if (qty <= min) health.low++;
        else health.healthy++;
    });

    return health;
}

function buildCriticalProducts(products) {
    return products
        .filter(product => Number(product.quantity || 0) <= Number(product.min_quantity || 0))
        .map(product => ({
            id: product.id,
            name: product.name || product.part_number || `ID ${product.id}`,
            part: product.part_number || '-',
            qty: Number(product.quantity || 0),
            min: Number(product.min_quantity || 0)
        }))
        .sort((a, b) => a.qty - a.min - (b.qty - b.min))
        .slice(0, 8);
}

function buildMakerValue(products) {
    const makerMap = {};

    products.forEach(product => {
        const maker = product.maker || product.brand || 'Outros';
        const value = Number(product.quantity || 0) * Number(product.cost_price || 0);
        if (value <= 0) return;
        makerMap[maker] = (makerMap[maker] || 0) + value;
    });

    const labels = Object.keys(makerMap)
        .sort((a, b) => makerMap[b] - makerMap[a])
        .slice(0, 8);
    return {
        labels,
        values: labels.map(label => makerMap[label])
    };
}

function computeDashboardSnapshot() {
    const products = state.dashboardProducts || [];
    const movements = getFilteredMovements(
        state.dashboardMovements || [],
        dashboardUiState.periodDays
    );
    const productsById = products.reduce((acc, product) => {
        acc[product.id] = product;
        return acc;
    }, {});

    const activeProducts = products.filter(product => Number(product.quantity || 0) > 0);
    const totalUnits = products.reduce((acc, product) => acc + Number(product.quantity || 0), 0);
    const outOfStock = products.filter(product => Number(product.quantity || 0) === 0).length;
    const lowStock = products.filter(product => {
        const qty = Number(product.quantity || 0);
        const min = Number(product.min_quantity || 0);
        return qty > 0 && qty <= min;
    }).length;
    const totalValue = products.reduce((acc, product) => {
        return acc + Number(product.quantity || 0) * Number(product.cost_price || 0);
    }, 0);

    const totalIn = movements
        .filter(movement => normalizeMovementType(movement) === 'IN')
        .reduce((acc, movement) => acc + Math.abs(Number(movement.quantity || 0)), 0);

    const totalOut = movements
        .filter(movement => normalizeMovementType(movement) === 'OUT')
        .reduce((acc, movement) => acc + Math.abs(Number(movement.quantity || 0)), 0);

    return {
        products,
        movements,
        productsById,
        activeProducts,
        totalUnits,
        outOfStock,
        lowStock,
        totalValue,
        totalIn,
        totalOut,
        topMoved: buildTopMoved(movements, productsById, dashboardUiState.topMetric),
        trend: buildTrendSeries(movements, dashboardUiState.periodDays),
        health: buildStockHealth(products),
        criticalProducts: buildCriticalProducts(products),
        makerValue: buildMakerValue(products)
    };
}

function bindDashboardControls() {
    const periodButtons = views.dashboard.querySelectorAll('.dash-period-btn');
    periodButtons.forEach(button => {
        button.onclick = () => {
            const value = button.dataset.period;
            dashboardUiState.periodDays = value === 'all' ? 'all' : Number(value);
            renderDashboard();
        };
    });

    const metricButtons = views.dashboard.querySelectorAll('.dash-metric-btn');
    metricButtons.forEach(button => {
        button.onclick = () => {
            dashboardUiState.topMetric = button.dataset.metric || 'qty';
            renderDashboard();
        };
    });

    const refreshButton = views.dashboard.querySelector('#dashboard-refresh');
    if (refreshButton) {
        refreshButton.onclick = async () => {
            await loadDashboard({ forceFetch: true });
        };
    }
}

export async function loadDashboard(options = {}) {
    if (!supabase || !state.currentUser) return;
    if (isDashboardFetching) return;

    if (!options.forceFetch && state.dashboardProducts && state.dashboardProducts.length > 0) {
        renderDashboard();
        return;
    }

    isDashboardFetching = true;

    try {
        const promises = [];
        const isAdmin = state.currentUser.role === 'admin';

        if (
            isAdmin ||
            state.currentUser.view_inventory ||
            state.currentUser.inventory_access !== 'none' ||
            state.currentUser.transit_access !== 'none'
        ) {
            promises.push(
                supabase.rpc('secure_fetch_inventory', {
                    p_user: state.currentUser.username,
                    p_pass: state.currentUser.password,
                    p_search: '',
                    p_category: 'all',
                    p_location: 'all'
                })
            );
        } else {
            promises.push(Promise.resolve({ data: [] }));
        }

        if (isAdmin || state.currentUser.view_history) {
            promises.push(
                supabase.rpc('secure_fetch_history', {
                    p_user: state.currentUser.username,
                    p_pass: state.currentUser.password,
                    p_limit: 400,
                    p_offset: 0
                })
            );
            promises.push(
                supabase.rpc('secure_fetch_app_events', {
                    p_user: state.currentUser.username,
                    p_pass: state.currentUser.password,
                    p_count_only: true
                })
            );
        } else {
            promises.push(Promise.resolve({ data: [] }));
            promises.push(Promise.resolve({ data: 0 }));
        }

        const [invRes, moveRes, countRes] = await Promise.all(promises);

        if (invRes.error) throw invRes.error;
        if (moveRes.error) throw moveRes.error;
        if (countRes.error) throw countRes.error;

        state.dashboardProducts = invRes.data || [];
        state.dashboardMovements = moveRes.data || [];
        state.totalMovementsCount = countRes.data || 0;

        renderDashboard();
    } catch (err) {
        console.error('Dashboard Load Error:', err);
        showToast('Erro ao carregar dashboard.', 'error');
    } finally {
        isDashboardFetching = false;
    }
}

export function renderDashboard() {
    const canViewPrices = !!state.currentUser?.can_view_prices;
    dashboardSnapshot = computeDashboardSnapshot();

    const {
        products,
        movements,
        activeProducts,
        totalUnits,
        outOfStock,
        lowStock,
        totalValue,
        totalIn,
        totalOut,
        criticalProducts
    } = dashboardSnapshot;

    views.dashboard.innerHTML = `
        <div class="dashboard-shell">
            <div class="dashboard-topbar">
                <div class="dashboard-title">
                    <h2>Painel de Operacoes</h2>
                    <p>Resumo operacional do inventario e movimentos</p>
                </div>
                <div class="dashboard-actions">
                    <div class="dash-control-group">
                        <button class="dash-period-btn ${dashboardUiState.periodDays === 7 ? 'active' : ''}" data-period="7">7D</button>
                        <button class="dash-period-btn ${dashboardUiState.periodDays === 30 ? 'active' : ''}" data-period="30">30D</button>
                        <button class="dash-period-btn ${dashboardUiState.periodDays === 90 ? 'active' : ''}" data-period="90">90D</button>
                        <button class="dash-period-btn ${dashboardUiState.periodDays === 'all' ? 'active' : ''}" data-period="all">Tudo</button>
                    </div>
                    <button class="btn btn-secondary" id="dashboard-refresh"><i class="fa-solid fa-rotate-right"></i> Atualizar</button>
                </div>
            </div>

            <div class="dash-kpi-grid">
                <div class="dash-kpi-card">
                    <span class="dash-kpi-label">Itens Ativos</span>
                    <p class="dash-kpi-value">${activeProducts.length}</p>
                    <span class="dash-kpi-meta">de ${products.length} no catalogo</span>
                </div>
                <div class="dash-kpi-card">
                    <span class="dash-kpi-label">Unidades em Stock</span>
                    <p class="dash-kpi-value">${totalUnits.toLocaleString()}</p>
                    <span class="dash-kpi-meta">entrada ${totalIn.toLocaleString()} | saida ${totalOut.toLocaleString()}</span>
                </div>
                <div class="dash-kpi-card is-warning" onclick="window.navigateTo('inventory')" style="cursor:pointer;">
                    <span class="dash-kpi-label">Stock Critico</span>
                    <p class="dash-kpi-value">${lowStock + outOfStock}</p>
                    <span class="dash-kpi-meta">${lowStock} baixo | ${outOfStock} sem stock</span>
                </div>
                ${
                    canViewPrices
                        ? `
                <div class="dash-kpi-card">
                    <span class="dash-kpi-label">Valor de Inventario</span>
                    <p class="dash-kpi-value">${formatCurrency(totalValue)}</p>
                    <span class="dash-kpi-meta">custo acumulado atual</span>
                </div>
                `
                        : ''
                }
                <div class="dash-kpi-card">
                    <span class="dash-kpi-label">Movimentos Totais</span>
                    <p class="dash-kpi-value">${Number(state.totalMovementsCount || 0).toLocaleString()}</p>
                    <span class="dash-kpi-meta">janela atual: ${movements.length}</span>
                </div>
            </div>

            <div class="dash-info-grid">
                <div class="dash-panel">
                    <div class="dash-panel-head">
                        <h3>Produtos em Risco</h3>
                        <span>${criticalProducts.length} itens</span>
                    </div>
                    <div class="dash-table-wrap">
                        <table class="dash-table compact">
                            <thead>
                                <tr><th>Produto</th><th>PN</th><th>Stock</th><th>Min</th></tr>
                            </thead>
                            <tbody>
                                ${
                                    criticalProducts.length
                                        ? criticalProducts
                                              .map(
                                                  p => `
                                    <tr>
                                        <td>${p.name}</td>
                                        <td>${p.part}</td>
                                        <td class="${p.qty === 0 ? 'txt-danger' : 'txt-warning'}">${p.qty}</td>
                                        <td>${p.min}</td>
                                    </tr>
                                `
                                              )
                                              .join('')
                                        : '<tr><td colspan="4" class="empty">Sem itens criticos</td></tr>'
                                }
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="dash-panel">
                    <div class="dash-panel-head">
                        <h3>Ultimas Movimentacoes</h3>
                        <span>${movements.length} registos</span>
                    </div>
                    <div class="dash-table-wrap">
                        <table class="dash-table compact">
                            <thead>
                                <tr><th>Data</th><th>Produto</th><th>Type</th><th>Qtd</th></tr>
                            </thead>
                            <tbody>
                                ${
                                    movements
                                        .slice(0, 8)
                                        .map(movement => {
                                            const date = getMovementDate(movement);
                                            const type = normalizeMovementType(movement);
                                            const productName =
                                                movement.product_name ||
                                                dashboardSnapshot.productsById[movement.product_id]
                                                    ?.name ||
                                                `ID ${movement.product_id}`;
                                            return `
                                    <tr>
                                        <td>${date ? date.toLocaleDateString('pt-PT') : '-'}</td>
                                        <td>${productName}</td>
                                        <td class="${type === 'IN' ? 'txt-success' : 'txt-danger'}">${type === 'IN' ? 'Entrada' : 'Saida'}</td>
                                        <td>${Math.abs(Number(movement.quantity || 0))}</td>
                                    </tr>`;
                                        })
                                        .join('') ||
                                    '<tr><td colspan="4" class="empty">Sem dados no periodo</td></tr>'
                                }
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div class="dash-charts-grid">
                <div class="dash-panel chart-panel">
                    <div class="dash-panel-head">
                        <h3>Top Movimentados</h3>
                        <div class="dash-control-group">
                            <button class="dash-metric-btn ${dashboardUiState.topMetric === 'qty' ? 'active' : ''}" data-metric="qty">Quantidade</button>
                            <button class="dash-metric-btn ${dashboardUiState.topMetric === 'value' ? 'active' : ''}" data-metric="value" ${canViewPrices ? '' : 'disabled'}>Valor</button>
                        </div>
                    </div>
                    <div class="chart-wrapper"><canvas id="chart-top-moved"></canvas></div>
                </div>

                <div class="dash-panel chart-panel">
                    <div class="dash-panel-head">
                        <h3>Tendencia de Movimentos</h3>
                        <span>Entradas vs Saidas</span>
                    </div>
                    <div class="chart-wrapper"><canvas id="chart-trend"></canvas></div>
                </div>

                <div class="dash-panel chart-panel">
                    <div class="dash-panel-head">
                        <h3>Saude do Stock</h3>
                        <span>distribuicao atual</span>
                    </div>
                    <div class="chart-wrapper"><canvas id="chart-health"></canvas></div>
                </div>

                ${
                    canViewPrices
                        ? `
                <div class="dash-panel chart-panel">
                    <div class="dash-panel-head">
                        <h3>Valor por Marca</h3>
                        <span>top 8</span>
                    </div>
                    <div class="chart-wrapper"><canvas id="chart-maker-value"></canvas></div>
                </div>
                `
                        : ''
                }
            </div>

            <div class="quick-actions">
                <button class="action-btn" onclick="window.navigateTo('inventory')"><i class="fa-solid fa-boxes-stacked"></i><span>Inventario</span></button>
                <button class="action-btn" onclick="window.navigateTo('transit')"><i class="fa-solid fa-truck-fast"></i><span>Transito</span></button>
                <button class="action-btn" onclick="window.navigateTo('history')"><i class="fa-solid fa-clock-rotate-left"></i><span>Historico</span></button>
                <button class="action-btn" onclick="window.navigateTo('logistics')"><i class="fa-solid fa-ship"></i><span>Logistica</span></button>
            </div>
        </div>
    `;

    bindDashboardControls();
    setTimeout(initDashboardCharts, 60);
}

async function initDashboardCharts() {
    if (!dashboardSnapshot) return;
    if (!(await ensureChartJs())) {
        console.warn('Chart.js indisponível, gráficos do dashboard não foram inicializados.');
        return;
    }

    const { topMoved, trend, health, makerValue } = dashboardSnapshot;

    const topCtx = document.getElementById('chart-top-moved');
    if (topCtx) {
        if (state.chartInstances.top) state.chartInstances.top.destroy();
        state.chartInstances.top = new Chart(topCtx, {
            type: 'bar',
            data: {
                labels: topMoved.map(item =>
                    item.name.length > 24 ? `${item.name.slice(0, 24)}...` : item.name
                ),
                datasets: [
                    {
                        label: dashboardUiState.topMetric === 'value' ? 'Valor' : 'Quantidade',
                        data: topMoved.map(item =>
                            dashboardUiState.topMetric === 'value' ? item.value : item.qty
                        ),
                        backgroundColor: '#ef4444',
                        borderRadius: 4,
                        maxBarThickness: 26
                    }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx =>
                                dashboardUiState.topMetric === 'value'
                                    ? formatCurrency(Number(ctx.parsed.x || 0))
                                    : `${Number(ctx.parsed.x || 0).toLocaleString()} un`
                        }
                    }
                },
                scales: {
                    x: { grid: { color: '#eef2f7' } },
                    y: { grid: { display: false } }
                }
            }
        });
    }

    const trendCtx = document.getElementById('chart-trend');
    if (trendCtx) {
        if (state.chartInstances.trend) state.chartInstances.trend.destroy();
        state.chartInstances.trend = new Chart(trendCtx, {
            type: 'line',
            data: {
                labels: trend.labels,
                datasets: [
                    {
                        label: 'Entradas',
                        data: trend.inData,
                        borderColor: '#22c55e',
                        backgroundColor: 'rgba(34, 197, 94, 0.15)',
                        tension: 0.3,
                        fill: true,
                        pointRadius: 2
                    },
                    {
                        label: 'Saidas',
                        data: trend.outData,
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.12)',
                        tension: 0.3,
                        fill: true,
                        pointRadius: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                scales: {
                    x: { grid: { color: '#eef2f7' } },
                    y: { beginAtZero: true, grid: { color: '#eef2f7' } }
                }
            }
        });
    }

    const healthCtx = document.getElementById('chart-health');
    if (healthCtx) {
        if (state.chartInstances.health) state.chartInstances.health.destroy();
        state.chartInstances.health = new Chart(healthCtx, {
            type: 'doughnut',
            data: {
                labels: ['Saudavel', 'Baixo', 'Sem Stock'],
                datasets: [
                    {
                        data: [health.healthy, health.low, health.out],
                        backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'],
                        borderColor: '#ffffff',
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }

    const makerCtx = document.getElementById('chart-maker-value');
    if (makerCtx) {
        if (state.chartInstances.maker) state.chartInstances.maker.destroy();
        state.chartInstances.maker = new Chart(makerCtx, {
            type: 'bar',
            data: {
                labels: makerValue.labels,
                datasets: [
                    {
                        label: 'Valor',
                        data: makerValue.values,
                        backgroundColor: '#0f172a',
                        borderRadius: 4,
                        maxBarThickness: 30
                    }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => formatCurrency(Number(ctx.parsed.x || 0))
                        }
                    }
                },
                scales: {
                    x: { grid: { color: '#eef2f7' } },
                    y: { grid: { display: false } }
                }
            }
        });
    }
}
