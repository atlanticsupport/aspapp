// Import History Module - View and manage import history
import { supabase } from '../supabase-client.js';
import { state } from '../core/state.js';
import { showToast } from '../core/ui.js';
import { dialog } from '../ui/dialogs-original.js';

export async function loadImportHistory() {
    try {
        const { data, error } = await supabase.rpc('rpc', {
            rpc: 'get_import_history',
            p_limit: 100,
            p_include_details: false
        });

        if (error) throw error;

        renderImportHistory(data);
    } catch (error) {
        console.error('Error loading import history:', error);
        showToast('Erro ao carregar histórico de importações', 'error');
    }
}

function renderImportHistory(imports) {
    const container = document.getElementById('import-history-container');
    if (!container) return;

    if (!imports || imports.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-file-import"></i>
                <h3>Nenhuma importação encontrada</h3>
                <p>Ainda não foram realizadas importações de Excel.</p>
            </div>
        `;
        return;
    }

    const html = `
        <div class="import-filters">
            <select id="filter-table" class="form-select">
                <option value="">Todas as Tabelas</option>
                <option value="products">Produtos</option>
                <option value="logistics_items">Itens Logísticos</option>
            </select>
            <button class="btn-primary" onclick="window.importHistory.refresh()">
                <i class="fa-solid fa-refresh"></i> Atualizar
            </button>
        </div>
        <div class="import-list">
            ${imports.map(imp => renderImportItem(imp)).join('')}
        </div>
    `;

    container.innerHTML = html;

    // Add event listeners
    container.querySelectorAll('.btn-revert-import').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const importId = e.target.dataset.importId;
            const tableName = e.target.dataset.tableName;
            const itemCount = e.target.dataset.itemCount;
            revertImport(importId, tableName, itemCount);
        });
    });

    container.querySelectorAll('.btn-view-details').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const importId = e.target.dataset.importId;
            viewImportDetails(importId);
        });
    });
}

function renderImportItem(importData) {
    const statusClass = {
        'completed': 'success',
        'completed_with_errors': 'warning',
        'failed': 'error',
        'reverted': 'info',
        'processing': 'info'
    }[importData.status] || 'info';

    const statusIcon = {
        'completed': 'fa-check-circle',
        'completed_with_errors': 'fa-exclamation-triangle',
        'failed': 'fa-times-circle',
        'reverted': 'fa-undo',
        'processing': 'fa-spinner fa-spin'
    }[importData.status] || 'fa-question-circle';

    const canRevert = importData.status === 'completed' && 
                      state.currentUser && 
                      (state.currentUser.role === 'admin' || state.currentUser.inventory_access === 'write');

    const duration = importData.end_time ? 
        formatDuration(new Date(importData.start_time), new Date(importData.end_time)) : 
        '-';

    return `
        <div class="import-item" data-import-id="${importData.id}">
            <div class="import-header">
                <div class="import-info">
                    <h4>${importData.file_name}</h4>
                    <div class="import-meta">
                        <span class="table-name">${importData.table_name}</span>
                        <span class="import-date">${formatDateTime(importData.created_at)}</span>
                        <span class="import-duration">Duração: ${duration}</span>
                    </div>
                </div>
                <div class="import-status">
                    <span class="status-badge ${statusClass}">
                        <i class="fa-solid ${statusIcon}"></i>
                        ${getStatusText(importData.status)}
                    </span>
                </div>
            </div>
            <div class="import-stats">
                <div class="stat">
                    <i class="fa-solid fa-check"></i>
                    <span>Importados: <strong>${importData.imported_items || 0}</strong></span>
                </div>
                <div class="stat">
                    <i class="fa-solid fa-times"></i>
                    <span>Falhas: <strong>${importData.failed_items || 0}</strong></span>
                </div>
                <div class="stat">
                    <i class="fa-solid fa-database"></i>
                    <span>Tamanho: <strong>${formatFileSize(importData.file_size)}</strong></span>
                </div>
            </div>
            <div class="import-actions">
                <button class="btn-secondary btn-view-details" data-import-id="${importData.id}">
                    <i class="fa-solid fa-eye"></i> Detalhes
                </button>
                ${canRevert ? `
                    <button class="btn-danger btn-revert-import" 
                            data-import-id="${importData.id}" 
                            data-table-name="${importData.table_name}"
                            data-item-count="${importData.imported_items || 0}">
                        <i class="fa-solid fa-undo"></i> Reverter
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

async function viewImportDetails(importId) {
    try {
        const { data, error } = await supabase.rpc('rpc', {
            rpc: 'get_import_history',
            p_limit: 1,
            p_include_details: true,
            // Note: Would need to add filter by import_id in RPC
        });

        if (error) throw error;

        const importData = data.find(imp => imp.id === importId);
        if (!importData) {
            showToast('Importação não encontrada', 'error');
            return;
        }

        renderImportDetails(importData);
    } catch (error) {
        console.error('Error loading import details:', error);
        showToast('Erro ao carregar detalhes', 'error');
    }
}

function renderImportDetails(importData) {
    const successItems = importData.items?.filter(i => i.status === 'success') || [];
    const failedItems = importData.items?.filter(i => i.status === 'failed') || [];

    const dialogContent = `
        <div class="import-details-dialog">
            <div class="import-details-header">
                <h3>Detalhes da Importação</h3>
                <div class="import-summary">
                    <p><strong>Ficheiro:</strong> ${importData.file_name}</p>
                    <p><strong>Data:</strong> ${formatDateTime(importData.created_at)}</p>
                    <p><strong>Status:</strong> ${getStatusText(importData.status)}</p>
                </div>
            </div>
            
            <div class="import-tabs">
                <button class="tab-btn active" data-tab="summary">Resumo</button>
                <button class="tab-btn" data-tab="success">Sucessos (${successItems.length})</button>
                <button class="tab-btn" data-tab="failed">Falhas (${failedItems.length})</button>
            </div>
            
            <div class="tab-content active" id="tab-summary">
                <div class="summary-stats">
                    <div class="stat-card">
                        <i class="fa-solid fa-check-circle success"></i>
                        <div class="stat-info">
                            <strong>${importData.imported_items || 0}</strong>
                            <span>Itens Importados</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <i class="fa-solid fa-times-circle error"></i>
                        <div class="stat-info">
                            <strong>${importData.failed_items || 0}</strong>
                            <span>Falhas</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <i class="fa-solid fa-clock info"></i>
                        <div class="stat-info">
                            <strong>${formatDuration(new Date(importData.start_time), new Date(importData.end_time))}</strong>
                            <span>Duração Total</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="tab-content" id="tab-success">
                <div class="items-list">
                    ${successItems.slice(0, 100).map(item => `
                        <div class="item-row">
                            <span class="row-number">#${item.row_number}</span>
                            <span class="item-id">ID: ${item.item_id}</span>
                            <pre class="item-data">${JSON.stringify(JSON.parse(item.data), null, 2)}</pre>
                        </div>
                    `).join('')}
                    ${successItems.length > 100 ? `<p class="more-items">... e mais ${successItems.length - 100} itens</p>` : ''}
                </div>
            </div>
            
            <div class="tab-content" id="tab-failed">
                <div class="items-list">
                    ${failedItems.map(item => `
                        <div class="item-row error">
                            <span class="row-number">#${item.row_number}</span>
                            <span class="error-message">${item.error_message}</span>
                            <pre class="item-data">${JSON.stringify(JSON.parse(item.data), null, 2)}</pre>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;

    dialog(dialogContent, { size: 'large' });

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabName = e.target.dataset.tab;
            
            // Update buttons
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            // Update content
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`tab-${tabName}`).classList.add('active');
        });
    });
}

async function revertImport(importId, tableName, itemCount) {
    const confirmMessage = `Tem certeza que deseja reverter esta importação?\n\n` +
        `Isto irá APAGAR ${itemCount} itens da tabela ${tableName}.\n` +
        `Esta ação não pode ser desfeita.`;

    if (!confirm(confirmMessage)) return;

    try {
        showToast('A reverter importação...', 'info');

        const { data, error } = await supabase.rpc('rpc', {
            rpc: 'revert_import',
            p_import_id: importId
        });

        if (error) throw error;

        showToast(`Importação revertida com sucesso! ${data.deleted_items} itens removidos.`, 'success');
        
        // Refresh the list
        loadImportHistory();
        
        // Close any open dialogs
        const dialog = document.querySelector('.dialog-container');
        if (dialog) dialog.remove();

    } catch (error) {
        console.error('Error reverting import:', error);
        showToast(`Erro ao reverter: ${error.message}`, 'error');
    }
}

// Utility functions
function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('pt-PT');
}

function formatDuration(start, end) {
    if (!start || !end) return '-';
    const ms = end - start;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
}

function formatFileSize(bytes) {
    if (!bytes) return '-';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getStatusText(status) {
    const statusMap = {
        'completed': 'Concluída',
        'completed_with_errors': 'Concluída com Erros',
        'failed': 'Falhou',
        'reverted': 'Revertida',
        'processing': 'Em Processamento'
    };
    return statusMap[status] || status;
}

// Export module
window.importHistory = {
    loadImportHistory,
    refresh: loadImportHistory,
    viewImportDetails,
    revertImport
};
