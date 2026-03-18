import { state } from '../core/state.js';
import { supabase } from '../supabase-client.js';
import { showToast, formatCurrency } from '../core/ui.js';
import { views } from '../core/dom.js';

let isDashboardFetching = false;

export async function loadDashboard(options = {}) {
    if (!supabase || !state.currentUser) return;

    if (isDashboardFetching) return;

    if (!options.forceFetch && state.dashboardProducts && state.dashboardProducts.length > 0) {
        renderDashboard();
        return;
    }

    isDashboardFetching = true;

    try {
        console.time('[STATS] Dashboard Fetch Parallel');

        const promises = [];
        const isAdmin = state.currentUser.role === 'admin';

        if (isAdmin || state.currentUser.view_inventory || state.currentUser.inventory_access !== 'none' || state.currentUser.transit_access !== 'none') {
            promises.push(supabase.rpc('secure_fetch_inventory', {
                p_user: state.currentUser.username,
                p_pass: state.currentUser.password,
                p_search: '',
                p_category: 'all',
                p_location: 'all'
            }));
        } else {
            promises.push(Promise.resolve({ data: [] }));
        }

        if (isAdmin || state.currentUser.view_history) {
            promises.push(supabase.rpc('secure_fetch_history', {
                p_user: state.currentUser.username,
                p_pass: state.currentUser.password,
                p_limit: 10, // Fetch movements for top-moved chart
                p_offset: 0
            }));
            promises.push(supabase.rpc('secure_fetch_app_events', {
                p_user: state.currentUser.username,
                p_pass: state.currentUser.password,
                p_count_only: true // Total Actions/Events for the dashboard card
            }));
        } else {
            promises.push(Promise.resolve({ data: [] }));
            promises.push(Promise.resolve({ data: 0 }));
        }

        // Fetch inventory and history in parallel
        const [invRes, moveRes, countRes] = await Promise.all(promises);

        console.timeEnd('[STATS] Dashboard Fetch Parallel');

        if (invRes.error) throw invRes.error;
        if (moveRes.error) console.warn('Erro ao carregar movimentos do dashboard:', moveRes.error);

        state.dashboardProducts = invRes.data || [];
        state.dashboardMovements = moveRes.data || [];
        state.totalMovementsCount = countRes.data || 0;

        renderDashboard();
    } catch (err) {
        console.error('Dashboard Load Error:', err);
        showToast('Erro ao carregar estatísticas seguras.', 'error');
    } finally {
        isDashboardFetching = false;
    }
}

export function renderDashboard() {
    const activeProducts = state.dashboardProducts.filter(p => (p.quantity || 0) > 0);
    const totalUnits = state.dashboardProducts.reduce((acc, p) => acc + (p.quantity || 0), 0);
    const outOfStock = state.dashboardProducts.filter(p => (p.quantity || 0) === 0).length;
    const lowStockCount = state.dashboardProducts.filter(p => (p.quantity || 0) > 0 && (p.quantity || 0) <= (p.min_quantity || 0)).length;
    const totalValue = state.dashboardProducts.reduce((acc, p) => acc + ((p.quantity || 0) * (p.cost_price || 0)), 0);
    const avgRotation = state.dashboardMovements ? Math.round(state.dashboardMovements.reduce((acc, m) => acc + Math.abs(m.quantity), 0) / Math.max(1, state.dashboardProducts.length)) : 0;
    const canViewPrices = state.currentUser?.can_view_prices;

    views.dashboard.innerHTML = `
        <div class="dashboard-container" style="animation: fadeIn 0.4s ease-out;">
            <div class="dashboard-header">
                <div>
                    <i class="fa-solid fa-chart-line"></i>
                    <h1>Dashboard Executivo</h1>
                    <p>Visão geral em tempo real do seu inventário</p>
                </div>
                <div class="header-meta">
                    <span class="update-time" id="update-time">Atualizado agora</span>
                </div>
            </div>

            <!-- KPI Cards Row 1 -->
            <div class="kpi-grid-4">
                <div class="kpi-card kpi-blue">
                    <div class="kpi-icon"><i class="fa-solid fa-cubes"></i></div>
                    <div class="kpi-content">
                        <span class="kpi-label">Itens em Stock</span>
                        <p class="kpi-value">${activeProducts.length}</p>
                        <span class="kpi-meta">de ${state.dashboardProducts.length} totais</span>
                    </div>
                </div>

                <div class="kpi-card kpi-green">
                    <div class="kpi-icon"><i class="fa-solid fa-boxes-stacked"></i></div>
                    <div class="kpi-content">
                        <span class="kpi-label">Unidades no Armazém</span>
                        <p class="kpi-value">${totalUnits.toLocaleString()}</p>
                        <span class="kpi-meta">+ ${avgRotation} média / artigo</span>
                    </div>
                </div>

                <div class="kpi-card kpi-orange" onclick="window.navigateTo('low-stock')" style="cursor:pointer;">
                    <div class="kpi-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
                    <div class="kpi-content">
                        <span class="kpi-label">Alertas de Stock Baixo</span>
                        <p class="kpi-value">${lowStockCount}</p>
                        <span class="kpi-meta">${outOfStock} sem stock</span>
                    </div>
                </div>

                ${canViewPrices ? `
                <div class="kpi-card kpi-purple">
                    <div class="kpi-icon"><i class="fa-solid fa-sack-dollar"></i></div>
                    <div class="kpi-content">
                        <span class="kpi-label">Valor Total Inventário</span>
                        <p class="kpi-value">${formatCurrency(totalValue)}</p>
                        <span class="kpi-meta">Custo de aquisição</span>
                    </div>
                </div>
                ` : ''}

                <div class="kpi-card kpi-red">
                    <div class="kpi-icon"><i class="fa-solid fa-history"></i></div>
                    <div class="kpi-content">
                        <span class="kpi-label">Movimentações</span>
                        <p class="kpi-value">${state.totalMovementsCount || 0}</p>
                        <span class="kpi-meta">Últimos registos</span>
                    </div>
                </div>
            </div>

            <!-- Charts Section -->
            <div class="charts-section">
                <div class="section-title">
                    <i class="fa-solid fa-chart-bar"></i>
                    <span>Análise de Dados</span>
                </div>
                
                <div class="charts-grid">
                    <div class="chart-card">
                        <div class="chart-header">
                            <h3>Top 5 Produtos Movimentados</h3>
                            <span class="chart-badge">últimas movimentações</span>
                        </div>
                        <div class="chart-wrapper">
                            <canvas id="chart-top-moved"></canvas>
                        </div>
                    </div>

                    ${canViewPrices ? `
                    <div class="chart-card">
                        <div class="chart-header">
                            <h3>Distribuição de Valor por Marca</h3>
                            <span class="chart-badge">top 5 marcas</span>
                        </div>
                        <div class="chart-wrapper">
                            <canvas id="chart-maker-value"></canvas>
                        </div>
                    </div>
                    ` : ''}

                    <div class="chart-card">
                        <div class="chart-header">
                            <h3>Status de Categorias</h3>
                            <span class="chart-badge">distribuição por categoria</span>
                        </div>
                        <div class="chart-wrapper">
                            <canvas id="chart-category-status"></canvas>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Quick Actions -->
            <div class="quick-actions">
                <button class="action-btn action-inventory" onclick="window.navigateTo('inventory')">
                    <i class="fa-solid fa-boxes-stacked"></i>
                    <span>Ver Inventário</span>
                </button>
                <button class="action-btn action-transit" onclick="window.navigateTo('transit')">
                    <i class="fa-solid fa-truck-fast"></i>
                    <span>Chegadas</span>
                </button>
                <button class="action-btn action-history" onclick="window.navigateTo('history')">
                    <i class="fa-solid fa-history"></i>
                    <span>Histórico</span>
                </button>
            </div>
        </div>
    `;

    setTimeout(initDashboardCharts, 100);
}

function initDashboardCharts() {
    // Chart 1: Top Movimentados
    const moveStats = {};
    if (state.dashboardMovements) {
        state.dashboardMovements.forEach(m => {
            const pName = m.product_name || ('ID: ' + m.product_id);
            if (!moveStats[pName]) moveStats[pName] = { qty: 0, name: pName };
            moveStats[pName].qty += Math.abs(m.quantity);
        });
    }

    const topItems = Object.values(moveStats)
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

    const ctxTop = document.getElementById('chart-top-moved');
    if (ctxTop && topItems.length > 0) {
        if (state.chartInstances.top) state.chartInstances.top.destroy();
        state.chartInstances.top = new Chart(ctxTop, {
            type: 'bar',
            data: {
                labels: topItems.map(i => i.name.substring(0, 20)),
                datasets: [{
                    label: 'Quantidade Movimentada',
                    data: topItems.map(i => i.qty),
                    backgroundColor: '#6366f1',
                    borderRadius: 8,
                    borderSkipped: false,
                    hoverBackgroundColor: '#4f46e5'
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 12,
                        titleFont: { size: 13, weight: 'bold' },
                        bodyFont: { size: 12 },
                        borderColor: '#6366f1',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        grid: { drawBorder: false, color: 'rgba(0,0,0,0.05)' },
                        ticks: { font: { size: 12 } }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { font: { size: 11 } }
                    }
                }
            }
        });
    }

    // Chart 2: Valor por Fabricante
    const makerData = {};
    state.dashboardProducts.forEach(p => {
        const maker = p.maker || p.brand || 'Outros';
        const value = (p.quantity || 0) * (p.cost_price || 0);
        if (value > 0) makerData[maker] = (makerData[maker] || 0) + value;
    });

    const makerLabels = Object.keys(makerData).sort((a, b) => makerData[b] - makerData[a]).slice(0, 5);
    const makerValues = makerLabels.map(l => makerData[l]);

    const ctxMaker = document.getElementById('chart-maker-value');
    if (ctxMaker && makerValues.length > 0) {
        if (state.chartInstances.maker) state.chartInstances.maker.destroy();
        state.chartInstances.maker = new Chart(ctxMaker, {
            type: 'doughnut',
            data: {
                labels: makerLabels.map(l => l.substring(0, 15)),
                datasets: [{
                    data: makerValues,
                    backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899'],
                    borderColor: '#fff',
                    borderWidth: 3,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        position: 'bottom',
                        labels: { 
                            font: { size: 12 },
                            padding: 15,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return context.label + ': ' + percentage + '%';
                            }
                        }
                    }
                }
            }
        });
    }

    // Chart 3: Status por Categoria
    const categoryData = {};
    state.dashboardProducts.forEach(p => {
        const cat = p.category || 'Sem Categoria';
        const qty = p.quantity || 0;
        if (!categoryData[cat]) categoryData[cat] = { inStock: 0, lowStock: 0, outOfStock: 0 };
        
        if (qty === 0) {
            categoryData[cat].outOfStock++;
        } else if (qty <= (p.min_quantity || 0)) {
            categoryData[cat].lowStock++;
        } else {
            categoryData[cat].inStock++;
        }
    });

    const catLabels = Object.keys(categoryData).slice(0, 6);
    const inStockData = catLabels.map(c => categoryData[c].inStock);
    const lowStockData = catLabels.map(c => categoryData[c].lowStock);
    const outOfStockData = catLabels.map(c => categoryData[c].outOfStock);

    const ctxCat = document.getElementById('chart-category-status');
    if (ctxCat && catLabels.length > 0) {
        if (state.chartInstances.category) state.chartInstances.category.destroy();
        state.chartInstances.category = new Chart(ctxCat, {
            type: 'bar',
            data: {
                labels: catLabels.map(l => l.substring(0, 12)),
                datasets: [
                    {
                        label: 'Em Stock',
                        data: inStockData,
                        backgroundColor: '#10b981',
                        borderRadius: 6,
                        borderSkipped: false
                    },
                    {
                        label: 'Stock Baixo',
                        data: lowStockData,
                        backgroundColor: '#f59e0b',
                        borderRadius: 6,
                        borderSkipped: false
                    },
                    {
                        label: 'Sem Stock',
                        data: outOfStockData,
                        backgroundColor: '#ef4444',
                        borderRadius: 6,
                        borderSkipped: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: true,
                        grid: { display: false },
                        ticks: { font: { size: 11 } }
                    },
                    y: {
                        stacked: true,
                        grid: { drawBorder: false, color: 'rgba(0,0,0,0.05)' },
                        ticks: { font: { size: 11 } }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { 
                            font: { size: 11 },
                            padding: 12,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 10
                    }
                }
            }
        });
    }
}
