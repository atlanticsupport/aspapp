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
    const lowStockCount = state.dashboardProducts.filter(p => (p.quantity || 0) <= (p.min_quantity || 0) && p.quantity > 0).length;
    const totalValue = state.dashboardProducts.reduce((acc, p) => acc + ((p.quantity || 0) * (p.cost_price || 0)), 0);
    const canViewPrices = state.currentUser?.can_view_prices;

    views.dashboard.innerHTML = `
        <div class="dashboard-container" style="animation: fadeIn 0.4s ease-out;">
            <div class="view-header">
                <i class="fa-solid fa-chart-pie"></i>
                <h2>Insights Seguros do Armazém</h2>
            </div>
            
            <div class="card-grid">
                ${canViewPrices ? `
                <div class="stat-card">
                    <div class="stat-header">
                        <span>Valor Total</span>
                        <i class="fa-solid fa-sack-dollar" style="color:#10b981;"></i>
                    </div>
                    <p>${formatCurrency(totalValue)}</p>
                </div>
                ` : ''}

                <div class="stat-card">
                    <div class="stat-header">
                        <span>Unidades</span>
                        <i class="fa-solid fa-boxes-stacked" style="color:var(--primary-color);"></i>
                    </div>
                    <p>${totalUnits}</p>
                </div>

                <div class="stat-card" onclick="window.navigateTo('low-stock')" style="cursor:pointer;">
                    <div class="stat-header">
                        <span>Alertas Stock</span>
                        <i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b;"></i>
                    </div>
                    <p>${lowStockCount}</p>
                </div>

                <div class="stat-card">
                    <div class="stat-header">
                        <span>Eventos / Entradas</span>
                        <i class="fa-solid fa-clock-rotate-left" style="color:#6366f1;"></i>
                    </div>
                    <p>${state.totalMovementsCount || 0}</p>
                </div>
            </div>

            <div class="charts-grid">
                <div class="chart-container">
                    <h4>Top Movimentados</h4>
                    <div class="chart-wrapper">
                        <canvas id="chart-top-moved"></canvas>
                    </div>
                </div>
                ${canViewPrices ? `
                <div class="chart-container">
                    <h4>Valor por Fabricante</h4>
                    <div class="chart-wrapper">
                        <canvas id="chart-maker-value"></canvas>
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
    `;

    setTimeout(initDashboardCharts, 100);
}

function initDashboardCharts() {
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
                labels: topItems.map(i => i.name.substring(0, 15)),
                datasets: [{
                    label: 'Qtd Movimentada',
                    data: topItems.map(i => i.qty),
                    backgroundColor: '#6366f1',
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    }

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
                labels: makerLabels,
                datasets: [{
                    data: makerValues,
                    backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }
}
