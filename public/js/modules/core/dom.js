export const views = {
    dashboard: document.getElementById('view-dashboard'),
    inventory: document.getElementById('view-inventory'),
    history: document.getElementById('view-history'),
    admin: document.getElementById('view-admin'),
    transit: document.getElementById('view-transit'),
    'stock-out': document.getElementById('view-stock-out'),
    logistics: document.getElementById('view-logistics'),
    settings: document.getElementById('view-settings'),
    usage: document.getElementById('view-usage'),
    backups: document.getElementById('view-backups')
};

export const inventoryContent = document.getElementById('inventory-content');

export const modal = document.getElementById('product-modal');
export const productForm = document.getElementById('product-form');
export const btnAddProduct = document.getElementById('btn-add-product');
export const btnAddProductMobile = document.getElementById('btn-add-product-mobile');
export const searchInput = document.getElementById('global-search');

export const imageContainer = document.getElementById('header-image-container');
export const imageInput = document.getElementById('prod-image');
export const viewerOverlay = document.getElementById('image-viewer');
export const viewerImg = document.getElementById('viewer-img');

export const scannerModal = document.getElementById('scanner-modal');

// Quick Scan Elements
export const qsModal = document.getElementById('quick-scan-modal');

// User Modal
export const userModal = document.getElementById('user-modal');

// Missing DOM elements in initial export might be needed, added as I found them
export const btnScanQr = document.getElementById('btn-scan-qr');
export const btnExport = document.getElementById('btn-export-excel');
