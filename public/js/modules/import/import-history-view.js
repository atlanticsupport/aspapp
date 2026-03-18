// Import History View Module
import { loadImportHistory } from './import-history.js';
import { views } from '../core/dom.js';

export function renderImportHistoryView() {
    const container = views['import-history'];
    if (!container) return;

    container.innerHTML = `
        <div class="page-header">
            <h1>Historico de Importacoes</h1>
            <p>Visualize e anule importacoes de Excel e processos PHC no mesmo local.</p>
        </div>

        <div class="page-actions">
            <button class="btn-primary" onclick="window.navigateTo('inventory')">
                <i class="fa-solid fa-plus"></i> Nova Importacao
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
