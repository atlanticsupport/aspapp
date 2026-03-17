// Excel Import Handler - Integration with existing UI
import { ExcelImporter } from './import-excel.js';
import { showToast } from '../core/ui.js';

// Initialize Excel import functionality
export function initExcelImport() {
    // Add file input handler to existing import buttons
    document.addEventListener('click', (e) => {
        if (e.target.closest('.btn-excel-import')) {
            createExcelFileInput();
        }
    });
}

function createExcelFileInput() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.style.display = 'none';
    
    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            const importer = new ExcelImporter();
            await importer.importExcelFile(file, 'products');
        }
        input.remove();
    });
    
    document.body.appendChild(input);
    input.click();
}

// Add to existing import dialog
export function addExcelImportToDialog() {
    // Find existing import modal
    const modal = document.getElementById('phc-import-modal');
    if (!modal) return;
    
    // Add Excel import button if not exists
    if (!modal.querySelector('.btn-excel-import')) {
        const buttonContainer = modal.querySelector('.modal-actions');
        if (buttonContainer) {
            const excelBtn = document.createElement('button');
            excelBtn.className = 'btn-secondary btn-excel-import';
            excelBtn.innerHTML = '<i class="fa-solid fa-file-excel"></i> Importar Excel';
            buttonContainer.appendChild(excelBtn);
        }
    }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initExcelImport();
    setTimeout(addExcelImportToDialog, 100); // Wait for modal to be created
});
