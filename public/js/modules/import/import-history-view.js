// Import History View Module
import { loadImportHistory } from './import-history.js';

export function renderImportHistoryView() {
    const container = document.getElementById('main-content');
    if (!container) return;

    container.innerHTML = `
        <div class="page-header">
            <h1>📋 Histórico de Importações</h1>
            <p>Visualize e gerencie todas as importações de Excel realizadas</p>
        </div>

        <div class="page-actions">
            <button class="btn-primary" onclick="window.location.hash = '#inventory'">
                <i class="fa-solid fa-plus"></i> Nova Importação
            </button>
        </div>

        <div id="import-history-container">
            <div class="loading">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <p>A carregar histórico...</p>
            </div>
        </div>
    `;

    // Load history
    loadImportHistory();
}

// Register view
if (typeof window !== 'undefined') {
    window.importHistoryView = {
        render: renderImportHistoryView
    };
}
