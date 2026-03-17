import { state } from '../core/state.js';
import { views } from '../core/dom.js';
import { loadDashboard } from './dashboard.js';
import { loadInventory, updateFilterOptions } from '../inventory.js';
import { dialog } from '../ui/dialogs-original.js';
import { loadAdminPanel } from '../admin.js';
import { loadTransitView } from '../transit.js';
import { loadHistory } from '../history.js';

export async function navigateTo(page) {
    state.currentPage = page;
    // Hide all views
    Object.values(views).forEach(el => { if (el) el.style.display = 'none'; });

    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active');
        if (el.dataset.page === page) el.classList.add('active');
    });

    // Check permissions?
    // app.js handled permission checks in ensurePermissions or simply by hiding tabs.
    // Here we can double check.
    const user = state.currentUser;
    if (page === 'admin' && user?.role !== 'admin') {
        // Fallback
        navigateTo('dashboard');
        return;
    }

    if (views[page]) {
        if (page === 'low-stock') {
            // 'low-stock' is virtual page mapping to inventory view
            views['inventory'].style.display = 'flex';
        } else {
            views[page].style.display = 'flex';
        }

        if (page === 'dashboard') {
            await loadDashboard();
        } else if (page === 'inventory') {
            await loadInventory();
            updateFilterOptions();
        } else if (page === 'low-stock') {
            await loadInventory({ lowStockOnly: true });
        } else if (page === 'history') {
            await loadHistory();
        } else if (page === 'transit') {
            await loadTransitView();
        } else if (page === 'stock-out') {
            const { loadStockOutView } = await import('../stock-out.js');
            await loadStockOutView();
        } else if (page === 'logistics') {
            const { loadLogisticsView } = await import('../logistics.js');
            await loadLogisticsView();
        } else if (page === 'settings') {
            loadSettings();
        } else if (page === 'admin') {
            await loadAdminPanel();
        } else if (page === 'usage') {
            const { loadUsageView } = await import('../usage.js');
            await loadUsageView();
        } else if (page === 'backups') {
            const { loadBackupsView } = await import('../backups.js');
            await loadBackupsView();
        } else if (page === 'import-history') {
            const { renderImportHistoryView } = await import('../import/import-history-view.js');
            renderImportHistoryView();
        }
    }
}

export function loadSettings() {
    const isAdmin = state.currentUser?.role === 'admin';

    views.settings.innerHTML = `
        <div class="settings-container" style="animation: fadeIn 0.4s ease-out;">
            <div class="view-header">
                <i class="fa-solid fa-gear"></i>
                <h2>Definições do Sistema</h2>
            </div>

            <!-- Column Visibility Section -->
            <div class="card" style="margin-bottom: 2rem;">
                <div class="card-header" style="padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-color); display:flex; align-items:center; gap:0.75rem;">
                    <i class="fa-solid fa-table-columns" style="color:var(--primary-color);"></i>
                    <h3 style="margin:0; font-size:1rem;">Colunas do Inventário</h3>
                </div>
                <div class="card-body" style="padding: 1.5rem;">
                    <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:1.5rem;">Selecione quais as colunas que deseja visualizar na tabela de inventário.</p>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 1rem;">
                        ${Object.keys(state.columnSettings).map(col => {
        const labels = {
            photo: 'Foto do Produto',
            part_number: 'Referência (PN)',
            name: 'Designação',
            location: 'Nave',
            box: 'Caixa',
            pallet: 'Palete',
            category: 'Tipo (Category)',
            sales_process: 'Processo/STK',
            cost_price: 'Preço de Custo',
            quantity: 'Quantidade',
            status: 'Estado (Badge)',
            actions: 'Ações de Tabela',
            id: 'ID Sistema',
            created_at: 'Data Criação',
            brand: 'Marca (Brand)',
            min_quantity: 'Stock Mínimo',
            description: 'Comentários',
            image_url: 'URL Imagem',
            maker: 'Fabricante (Maker)',
            equipment: 'Equipamento',
            updated_at: 'Última Edição',
            is_deleted: 'Estado Removido',
            order_to: 'Encomendado a',
            order_date: 'Data Encomenda',
            ship_plant: 'Ship Plant',
            delivery_time: 'Tempo Entrega',
            local_price: 'Preço Local',
            author: 'Autor Registo'
        };
        return `
                                <label style="display:flex; align-items:center; gap:0.75rem; cursor:pointer; padding:10px; border-radius:8px; background:#f8fafc; border:1px solid var(--border-color); transition: 0.2s;">
                                    <input type="checkbox" class="toggle-col" data-col="${col}" ${state.columnSettings[col] ? 'checked' : ''} style="width:18px; height:18px; accent-color: var(--primary-color);">
                                    <span style="font-size:0.85rem; font-weight:500; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${labels[col] || col}</span>
                                </label>
                            `;
    }).join('')}
                    </div>
                </div>
            </div>

            <!-- Appearance & Language Section (Local) -->
            <div class="card" style="margin-bottom: 2rem;">
                <div class="card-header" style="padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-color); display:flex; align-items:center; gap:0.75rem;">
                    <i class="fa-solid fa-palette" style="color:var(--primary-color);"></i>
                    <h3 style="margin:0; font-size:1rem;">Aparência & Região (Local)</h3>
                </div>
                <div class="card-body" style="padding: 1.5rem;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                        <div class="form-group">
                            <label style="font-size:0.85rem; color:var(--text-secondary); display:block; margin-bottom:0.5rem;">Tema Visual</label>
                            <select id="local-theme" style="width:100%; padding:10px; border:1px solid var(--border-color); border-radius:8px; background:white;">
                                <option value="light">🏠 Light / Padrão</option>
                                <option value="dark">🌙 Dark Mode (Beta)</option>
                                <option value="premium">✨ Premium Blue</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label style="font-size:0.85rem; color:var(--text-secondary); display:block; margin-bottom:0.5rem;">Idioma Interface</label>
                            <select id="local-lang" style="width:100%; padding:10px; border:1px solid var(--border-color); border-radius:8px; background:white;">
                                <option value="pt">🇵🇹 Português</option>
                                <option value="en">🇺🇸 English</option>
                            </select>
                        </div>
                    </div>
                    <button class="btn btn-primary" id="btn-save-local-prefs" style="margin-top:1.5rem; width:100%; background: #6366f1;">
                        <i class="fa-solid fa-check"></i> Aplicar Preferências Locais
                    </button>
                </div>
            </div>

            <!-- Labels Printing Section -->
            <div class="card" style="margin-bottom: 2rem;">
                <div class="card-header" style="padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-color); display:flex; align-items:center; gap:0.75rem;">
                    <i class="fa-solid fa-print" style="color:var(--primary-color);"></i>
                    <h3 style="margin:0; font-size:1rem;">Configuração de Etiquetas</h3>
                </div>
                <div class="card-body" style="padding: 1.5rem;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                        <div class="form-group">
                            <label style="font-size:0.85rem; color:var(--text-secondary);">Largura (cm)</label>
                            <input type="number" id="label-width" step="0.1" value="5" style="width:100%; padding:10px; border:1px solid var(--border-color); border-radius:8px;">
                        </div>
                        <div class="form-group">
                            <label style="font-size:0.85rem; color:var(--text-secondary);">Altura (cm)</label>
                            <input type="number" id="label-height" step="0.1" value="3" style="width:100%; padding:10px; border:1px solid var(--border-color); border-radius:8px;">
                        </div>
                    </div>
                    <button class="btn btn-primary" id="btn-save-label-settings" style="margin-top:1.5rem; width:100%;">
                        <i class="fa-solid fa-floppy-disk"></i> Guardar Configuração
                    </button>
                </div>
            </div>

            <!-- Data & Cache Section -->
            <div class="card" style="margin-bottom: 2rem;">
                <div class="card-header" style="padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-color); display:flex; align-items:center; gap:0.75rem;">
                    <i class="fa-solid fa-broom" style="color:var(--primary-color);"></i>
                    <h3 style="margin:0; font-size:1rem;">Memória Local & Cache</h3>
                </div>
                <div class="card-body" style="padding: 1.5rem; display:flex; gap:1rem;">
                    <button class="btn btn-secondary" id="btn-reset-columns" style="flex:1;">
                        <i class="fa-solid fa-rotate"></i> Reset Colunas
                    </button>
                    <button class="btn btn-secondary" id="btn-clear-local" style="flex:1; border-color: #fca5a5; color:#dc2626;">
                        <i class="fa-solid fa-trash-can"></i> Limpar Tudo (Local)
                    </button>
                </div>
            </div>


            <!-- System Info -->
            <div class="card">
                <div class="card-body" style="padding: 1.5rem; text-align:center;">
                    <p style="font-size:0.9rem; color:var(--text-primary); font-weight:600;">ASP APP v2.0</p>
                    <p style="font-size:0.8rem; color:var(--text-secondary);">Configurações guardadas localmente neste dispositivo.</p>
                </div>
            </div>
        </div>
    `;

    // Re-bind events after injection
    document.querySelectorAll('.toggle-col').forEach(cb => {
        cb.onchange = (e) => {
            const col = e.target.dataset.col;
            state.columnSettings[col] = e.target.checked;
            localStorage.setItem('columnSettings', JSON.stringify(state.columnSettings));
            // No need to reload current view, but inventory will use it next time it renders.
        };
    });

    const stored = localStorage.getItem('labelSettings');
    if (stored) {
        try {
            const settings = JSON.parse(stored);
            if (document.getElementById('label-width')) document.getElementById('label-width').value = settings.width || 5;
            if (document.getElementById('label-height')) document.getElementById('label-height').value = settings.height || 3;
        } catch (e) { }
    }

    // Cache Buttons Events
    const btnResetCol = document.getElementById('btn-reset-columns');
    if (btnResetCol) {
        btnResetCol.onclick = async () => {
            const confirmed = await dialog.confirm({
                title: 'Resetar Colunas',
                message: 'Deseja repor a visualização de colunas padrão?',
                confirmText: 'Sim, Resetar'
            });
            if (confirmed) {
                localStorage.removeItem('columnSettings');
                location.reload();
            }
        };
    }

    const btnClearLocal = document.getElementById('btn-clear-local');
    if (btnClearLocal) {
        btnClearLocal.onclick = async () => {
            const confirmed = await dialog.confirm({
                title: 'Limpar Memória Local',
                message: 'Esta ação irá apagar as suas preferências (tema, idioma, etc) neste dispositivo.\nOs dados de stock permanecem intactos.',
                confirmText: 'Sim, Limpar Tudo',
                type: 'danger'
            });
            if (confirmed) {
                localStorage.clear();
                location.reload();
            }
        };
    }


    // Load Local Prefs
    const localPrefs = JSON.parse(localStorage.getItem('localPrefs')) || { theme: 'light', lang: 'pt' };
    if (document.getElementById('local-theme')) document.getElementById('local-theme').value = localPrefs.theme;
    if (document.getElementById('local-lang')) document.getElementById('local-lang').value = localPrefs.lang;

    const btnSavePrefs = document.getElementById('btn-save-local-prefs');
    if (btnSavePrefs) {
        btnSavePrefs.onclick = () => {
            const theme = document.getElementById('local-theme').value;
            const lang = document.getElementById('local-lang').value;
            localStorage.setItem('localPrefs', JSON.stringify({ theme, lang }));
            import('./ui.js').then(m => m.showToast('Preferências aplicadas! (Local)', 'success'));
            // In a real app, theme switching logic would go here
            if (theme === 'dark') document.body.classList.add('dark-theme');
            else document.body.classList.remove('dark-theme');
        };
    }
    const btnSaveLabels = document.getElementById('btn-save-label-settings');
    if (btnSaveLabels) {
        btnSaveLabels.onclick = () => {
            const w = document.getElementById('label-width').value;
            const h = document.getElementById('label-height').value;
            localStorage.setItem('labelSettings', JSON.stringify({ width: w, height: h }));
            import('./ui.js').then(m => m.showToast('Definições de etiqueta guardadas!', 'success'));
        };
    }
}
