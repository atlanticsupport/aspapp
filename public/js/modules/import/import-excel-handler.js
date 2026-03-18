// Excel Import Handler - Integration with existing UI

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
    if (typeof window.importFromExcel === 'function') {
        window.importFromExcel();
    }
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
