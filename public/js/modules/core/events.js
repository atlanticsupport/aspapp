import { state } from './state.js';
import { supabase } from '../supabase-client.js';
import { showToast, showGlobalLoading, hideGlobalLoading } from './ui.js';
import { views, modal, scannerModal, productForm, imageContainer, imageInput, viewerOverlay, viewerImg, btnAddProduct, searchInput, qsModal } from './dom.js';
import { loadInventory, updateFilterOptions, renderProducts } from '../inventory.js';
import { navigateTo } from '../views/views.js';
import {
    openEditModal,
    saveProduct,
    updateHeaderImage,
    removeMainImage,
    openModal,
    closeModal,
    printCurrentProduct,
    openCurrentProductGallery,
    setProductImagesState,
    moveProductImage
} from '../products.js';
import { closeViewer, openViewer } from '../ag-grid-shim.js';
import { login, logout } from '../auth.js';
import { printPalletLabel, printBoxLabel } from '../printing.js';
import { dialog } from '../ui/dialogs-original.js';
import { openUserModal } from '../admin.js';
import { openViewerGallery } from '../gallery.js';

function openImageSourcePicker() {
    state.imageTarget = 'header';
    const sourceModal = document.getElementById('image-source-modal');
    if (sourceModal) {
        sourceModal.classList.add('open');
    } else if (imageInput) {
        imageInput.click();
    }
}

// Global actions shim
// Global actions shim
window.openProductGallery = async (productId) => {
    if (!productId) return;
    try {
        const { data: products } = await supabase.rpc('secure_fetch_any', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_table: 'products',
            p_params: { eq: { id: productId } }
        });
        const product = products && products.length > 0 ? products[0] : null;

        const { data: attachments } = await supabase.rpc('secure_fetch_any', {
            p_user: state.currentUser.username,
            p_pass: state.currentUser.password,
            p_table: 'attachments',
            p_params: {
                eq: { product_id: productId },
                order: { column: 'sort_order', ascending: true }
            }
        });

        const hasMedia = !!product?.image_url || (attachments || []).some((att) => {
            const type = att?.file_type || att?.type;
            return !!att?.url && (type === 'image' || type === 'video');
        });

        if (!hasMedia && product) {
            openEditModal(product);
            openImageSourcePicker();
            return;
        }

        setProductImagesState(product, attachments || []);
        openCurrentProductGallery();
    } catch (err) {
        console.error(err);
        showToast('Erro ao carregar galeria.', 'error');
    }
};

window.viewGenericImage = (url) => {
    if (!url) return;
    openViewerGallery([{ key: `generic:${url}`, url, category: 'generic' }]);
};

function updateViewerFromGallery() {
    if (!state.currentGallery || !state.currentGallery.length) return;
    const currentItem = state.currentGallery[state.galleryIndex];
    const url = typeof currentItem === 'string' ? currentItem : currentItem?.url;
    if (!url) return;
    viewerImg.src = url;

    const counter = document.getElementById('viewer-counter');
    if (counter) counter.textContent = `${state.galleryIndex + 1} / ${state.currentGallery.length}`;

    // Hide nav if only one image
    const prevBtn = document.getElementById('viewer-prev');
    const nextBtn = document.getElementById('viewer-next');
    if (prevBtn) prevBtn.style.display = state.currentGallery.length > 1 ? 'flex' : 'none';
    if (nextBtn) nextBtn.style.display = state.currentGallery.length > 1 ? 'flex' : 'none';

    const canReorder =
        !!currentItem &&
        typeof currentItem === 'object' &&
        currentItem.category === 'product' &&
        state.currentGallery.length > 1 &&
        (!!currentItem.attachmentId || !!currentItem.pendingId);
    const canDelete =
        !!currentItem &&
        typeof currentItem === 'object' &&
        currentItem.category === 'product';

    const moveLeftBtn = document.getElementById('btn-move-image-left');
    const moveRightBtn = document.getElementById('btn-move-image-right');
    const deleteBtn = document.getElementById('btn-delete-image');

    if (moveLeftBtn) moveLeftBtn.disabled = !canReorder || state.galleryIndex === 0;
    if (moveRightBtn) moveRightBtn.disabled = !canReorder || state.galleryIndex === state.currentGallery.length - 1;
    if (deleteBtn) deleteBtn.disabled = !canDelete;
}
window.updateViewerFromGallery = updateViewerFromGallery;

function setViewerActionsExpanded(expanded) {
    const actions = document.getElementById('viewer-actions-minimal');
    const toggleBtn = document.getElementById('btn-toggle-viewer-actions');
    if (!actions || !toggleBtn) return;

    actions.classList.toggle('collapsed', !expanded);
    toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggleBtn.title = expanded ? 'Recolher ações' : 'Expandir ações';
    toggleBtn.innerHTML = expanded
        ? '<i class="fa-solid fa-chevron-right"></i>'
        : '<i class="fa-solid fa-ellipsis"></i>';
}

function nextGalleryImage() {
    if (!state.currentGallery) return;
    state.galleryIndex = (state.galleryIndex + 1) % state.currentGallery.length;
    updateViewerFromGallery();
}

function prevGalleryImage() {
    if (!state.currentGallery) return;
    state.galleryIndex = (state.galleryIndex - 1 + state.currentGallery.length) % state.currentGallery.length;
    updateViewerFromGallery();
}

let html5QrcodeScanner = null;

export function setupEventListeners() {
    setViewerActionsExpanded(false);

    // Cookie helpers for Sidebar
    const setCookie = (name, val, days = 365) => {
        const d = new Date();
        d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = `${name}=${encodeURIComponent(JSON.stringify(val))};expires=${d.toUTCString()};path=/`;
    };
    const getCookie = (name) => {
        const v = `; ${document.cookie}`;
        const parts = v.split(`; ${name}=`);
        if (parts.length === 2) {
            try { return JSON.parse(decodeURIComponent(parts.pop().split(';').shift())); } catch (e) { return null; }
        }
        return JSON.parse(localStorage.getItem(name) || 'null'); // backward compatibility
    };

    // Mobile Sidebar Toggling
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    const toggleSidebar = () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
    };

    if (btnToggleSidebar) btnToggleSidebar.onclick = toggleSidebar;
    if (overlay) overlay.onclick = toggleSidebar;

    // Navigation & Folder Toggle
    document.querySelectorAll('.nav-item').forEach(link => {
        link.onclick = (e) => {
            e.preventDefault();
            navigateTo(link.dataset.page);

            // Close sidebar on mobile after clicking
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('open');
                overlay.classList.remove('open');
            }
        };
    });

    // Unified Sidebar Drag & Drop Logic
    const navMenu = document.querySelector('.nav-menu');
    const getDraggable = (el) => el.closest('.nav-item, .nav-folder');

    const setupDraggable = (el) => {
        el.addEventListener('dragstart', (e) => {
            const id = el.dataset.page || el.id;
            const type = el.classList.contains('nav-item') ? 'item' : 'folder';
            e.dataTransfer.setData('text/plain', JSON.stringify({ id, type }));
            el.style.opacity = '0.4';
            e.stopPropagation();
        });

        el.addEventListener('dragend', () => {
            el.style.opacity = '1';
            document.querySelectorAll('.nav-item, .nav-folder').forEach(item => item.classList.remove('drag-over'));
        });

        el.addEventListener('dragover', (e) => {
            e.preventDefault();
            const target = getDraggable(e.target);
            if (target && target !== el) {
                target.classList.add('drag-over');
            }
        });

        el.addEventListener('dragleave', (e) => {
            const target = getDraggable(e.target);
            if (target) target.classList.remove('drag-over');
        });

        el.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const sourceData = JSON.parse(e.dataTransfer.getData('text/plain'));
            const sourceId = sourceData.id;
            const sourceType = sourceData.type;
            const target = getDraggable(e.target);

            if (!target) return;

            const sourceEl = sourceType === 'item'
                ? document.querySelector(`.nav-item[data-page="${sourceId}"]`)
                : document.getElementById(sourceId);

            if (sourceEl && sourceEl !== target) {
                // Reorder only if they share the same parent for stability
                if (sourceEl.parentElement === target.parentElement) {
                    const parent = sourceEl.parentElement;
                    const children = Array.from(parent.children);
                    const sourceIdx = children.indexOf(sourceEl);
                    const targetIdx = children.indexOf(target);

                    if (sourceIdx < targetIdx) {
                        target.after(sourceEl);
                    } else {
                        target.before(sourceEl);
                    }

                    // Persist Full Sidebar Order structure
                    // We save a list of all elements in the order they appear in the DOM
                    // Folders use their ID, Items use their data-page
                    const fullOrder = Array.from(navMenu.querySelectorAll('.nav-item, .nav-folder')).map(item => {
                        return {
                            id: item.dataset.page || item.id,
                            type: item.classList.contains('nav-item') ? 'item' : 'folder'
                        };
                    });
                    setCookie('sidebarOrder', fullOrder);
                }
            }
        });
    };

    document.querySelectorAll('.nav-item, .nav-folder').forEach(el => setupDraggable(el));

    // Folder Toggling logic with persistence
    const savedStates = getCookie('sidebarFolders') || {};

    document.querySelectorAll('.nav-folder').forEach(folder => {
        const folderId = folder.id;
        const header = folder.querySelector('.nav-folder-header');
        const folderIcon = header?.querySelector('i:first-child');

        // Restore State
        if (folderId && savedStates[folderId] !== undefined) {
            const isExpanded = savedStates[folderId];
            folder.classList.toggle('expanded', isExpanded);
            if (folderIcon) {
                folderIcon.className = isExpanded ? 'fa-solid fa-folder-open' : 'fa-solid fa-folder';
            }
        }

        if (header) {
            header.onclick = (e) => {
                e.stopPropagation();
                const isExpanded = folder.classList.toggle('expanded');

                // Save State
                if (folderId) {
                    const currentStates = getCookie('sidebarFolders') || {};
                    currentStates[folderId] = isExpanded;
                    setCookie('sidebarFolders', currentStates);
                }

                // Change icon
                if (folderIcon) {
                    folderIcon.className = isExpanded ? 'fa-solid fa-folder-open' : 'fa-solid fa-folder';
                }
            };
        }
    });

    // Modal Triggers
    if (btnAddProduct) btnAddProduct.onclick = () => { closeModal(); openModal(); };
    const btnAddProductMobile = document.getElementById('btn-add-product-mobile');
    if (btnAddProductMobile) btnAddProductMobile.onclick = () => { closeModal(); openModal(); };
    document.querySelectorAll('.close-modal').forEach(btn => btn.onclick = closeModal);

    // Header Buttons
    const btnHeaderSave = document.getElementById('btn-header-save');
    if (btnHeaderSave) btnHeaderSave.onclick = () => saveProduct();

    const btnHeaderPrint = document.getElementById('btn-header-print');
    if (btnHeaderPrint) btnHeaderPrint.onclick = () => printCurrentProduct();

    const btnPrintPallet = document.getElementById('btn-print-pallet');
    if (btnPrintPallet) {
        btnPrintPallet.onclick = (e) => {
            e.stopPropagation();
            if (state.filterState.pallet && state.filterState.pallet !== 'all') {
                printPalletLabel(state.filterState.pallet);
            } else {
                showToast('Selecione uma palete no filtro para imprimir o conteúdo.', 'info');
            }
        };
    }

    const btnPrintBox = document.getElementById('btn-print-box');
    if (btnPrintBox) {
        btnPrintBox.onclick = (e) => {
            e.stopPropagation();
            if (state.filterState.box && state.filterState.box !== 'all') {
                printBoxLabel(state.filterState.box);
            } else {
                showToast('Selecione uma caixa no filtro para imprimir a etiqueta.', 'info');
            }
        };
    }

    // Column Settings
    document.addEventListener('change', (e) => {
        if (e.target && e.target.dataset && e.target.dataset.col) {
            state.columnSettings[e.target.dataset.col] = e.target.checked;
            localStorage.setItem('columnSettings', JSON.stringify(state.columnSettings));

            // Re-render if in inventory or low-stock
            const activePage = document.querySelector('.nav-item.active')?.dataset.page;
            if (activePage === 'inventory') loadInventory();
            else if (activePage === 'low-stock') loadInventory({ lowStockOnly: true });
        }
    });

    // Close Modals on Backdrop
    // Note: Some modals might be managed by other modules (like user-modal in admin.js)
    // We add a generic listener for known modals here
    const modals = [
        modal,
        scannerModal,
        qsModal,
        document.getElementById('pallet-manifest-modal'),
        document.getElementById('pdf-import-modal'),
        document.getElementById('user-modal'),
        document.getElementById('search-config-modal')
    ];
    modals.forEach(m => {
        if (m) {
            m.addEventListener('click', (e) => {
                if (e.target === m) {
                    m.classList.remove('open');
                    if (m === modal) closeModal();
                }
            });
        }
    });

    // Scanner
    const btnScanQr = document.getElementById('btn-scan-qr');
    if (btnScanQr) btnScanQr.onclick = startScanner;

    const btnSearchConfig = document.getElementById('btn-search-settings');
    if (btnSearchConfig) btnSearchConfig.onclick = () => window.toggleSearchConfig();

    document.querySelectorAll('.close-search-config').forEach(btn => {
        btn.onclick = () => document.getElementById('search-config-modal').classList.remove('open');
    });

    const closeScannerBtn = document.getElementById('close-scanner');
    if (closeScannerBtn) closeScannerBtn.onclick = () => {
        scannerModal.classList.remove('open');
        stopScanner();
    };

    // Logout
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) btnLogout.onclick = () => logout();

    // Search
    if (searchInput) {
        searchInput.oninput = async (e) => {
            state.currentFilter = e.target.value.trim();
            state.inventoryPage = 0;

            const currentPage = document.querySelector('.nav-item.active')?.dataset.page;
            if (currentPage === 'inventory') {
                loadInventory();
            }
        };
        // Keep Enter for navigation if not on inventory
        searchInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                const currentPage = document.querySelector('.nav-item.active')?.dataset.page;
                if (currentPage !== 'inventory') navigateTo('inventory');
            }
        };
    }

    // Form Submit
    if (productForm) productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveProduct();
    });

    // Login Handler
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = document.getElementById('login-username').value;
            const pass = document.getElementById('login-password').value;
            const btn = loginForm.querySelector('button[type="submit"]');

            try {
                if (btn) { btn.disabled = true; btn.textContent = 'A entrar...'; }
                await login(user, pass);
            } catch (err) {
                console.error(err);
                showToast('Erro ao tentar entrar.', 'error');
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = 'Entrar no Sistema'; }
            }
        });
    }

    // Image Handlers
    // Image Handlers
    if (imageContainer) imageContainer.addEventListener('click', () => {
        const hasExtraImages = document.querySelectorAll('#product-gallery-list img, #transit-attachments-list img, #product-gallery-list video, #transit-attachments-list video').length > 0;

        if (!state.currentImageUrl && !hasExtraImages) {
            // Open Source Picker
            openImageSourcePicker();
            return;
        }
        openCurrentProductGallery();
    });

    // Image Source Modal Handlers (CORRECTED)
    const sourceMo = document.getElementById('image-source-modal');
    if (sourceMo) {
        // Camera Button
        const btnCam = document.getElementById('btn-source-camera');
        if (btnCam) {
            btnCam.onclick = async () => {
                sourceMo.classList.remove('open');
                const cam = document.getElementById('prod-camera-input');
                if (cam) {
                    try {
                        cam.click();
                    } catch (e) {
                        await dialog.alert({
                            title: 'Erro na Camara',
                            message: `Nao foi possivel abrir a camara.\n${e.message}`,
                            type: 'danger'
                        });
                    }
                } else {
                    await dialog.alert({
                        title: 'Camara Indisponivel',
                        message: 'Input de camara nao encontrado.',
                        type: 'danger'
                    });
                }
            };
        }

        // Gallery Button
        const btnGal = document.getElementById('btn-source-gallery');
        if (btnGal) {
            btnGal.onclick = async () => {
                sourceMo.classList.remove('open');
                if (imageInput) {
                    try {
                        imageInput.click();
                    } catch (e) {
                        await dialog.alert({
                            title: 'Erro na Galeria',
                            message: `Nao foi possivel abrir a galeria.\n${e.message}`,
                            type: 'danger'
                        });
                    }
                } else {
                    await dialog.alert({
                        title: 'Galeria Indisponivel',
                        message: 'Input de galeria nao encontrado.',
                        type: 'danger'
                    });
                }
            };
        }

        const closeBtn = sourceMo.querySelector('.close-source-modal');
        if (closeBtn) closeBtn.onclick = () => sourceMo.classList.remove('open');

        sourceMo.addEventListener('click', (e) => {
            if (e.target === sourceMo) sourceMo.classList.remove('open');
        });
    }

    const btnCloseViewer = document.getElementById('btn-close-viewer-x');
    if (btnCloseViewer) btnCloseViewer.onclick = () => {
        setViewerActionsExpanded(false);
        closeViewer();
    };

    const btnCloseViewerTop = document.getElementById('btn-close-viewer-top');
    if (btnCloseViewerTop) btnCloseViewerTop.onclick = () => {
        setViewerActionsExpanded(false);
        closeViewer();
    };

    if (viewerOverlay) viewerOverlay.addEventListener('click', (e) => {
        if (e.target === viewerOverlay) {
            setViewerActionsExpanded(false);
            closeViewer();
        }
    });

    // Carousel Nav
    const btnPrev = document.getElementById('viewer-prev');
    const btnNext = document.getElementById('viewer-next');
    if (btnPrev) btnPrev.onclick = (e) => { e.stopPropagation(); prevGalleryImage(); };
    if (btnNext) btnNext.onclick = (e) => { e.stopPropagation(); nextGalleryImage(); };

    const btnToggleViewerActions = document.getElementById('btn-toggle-viewer-actions');
    if (btnToggleViewerActions) {
        btnToggleViewerActions.onclick = (e) => {
            e.stopPropagation();
            const actions = document.getElementById('viewer-actions-minimal');
            const isCollapsed = actions?.classList.contains('collapsed');
            setViewerActionsExpanded(!!isCollapsed);
        };
    }

    const btnMoveImageLeft = document.getElementById('btn-move-image-left');
    if (btnMoveImageLeft) {
        btnMoveImageLeft.onclick = async (e) => {
            e.stopPropagation();
            const currentItem = state.currentGallery?.[state.galleryIndex];
            if (!currentItem || typeof currentItem !== 'object') return;
            await moveProductImage(currentItem, -1);
        };
    }

    const btnMoveImageRight = document.getElementById('btn-move-image-right');
    if (btnMoveImageRight) {
        btnMoveImageRight.onclick = async (e) => {
            e.stopPropagation();
            const currentItem = state.currentGallery?.[state.galleryIndex];
            if (!currentItem || typeof currentItem !== 'object') return;
            await moveProductImage(currentItem, 1);
        };
    }

    // Keyboard Nav for viewer
    document.addEventListener('keydown', (e) => {
        if (!viewerOverlay.classList.contains('open')) return;
        if (e.key === 'ArrowRight') nextGalleryImage();
        if (e.key === 'ArrowLeft') prevGalleryImage();
        if (e.key === 'Escape') {
            setViewerActionsExpanded(false);
            closeViewer();
        }
    });

    if (imageInput) imageInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const category = state.currentTransitId ? 'reception' : 'product';

        if (state.imageTarget === 'gallery') {
            if (window.handleAttachmentSelectionFiles) {
                window.handleAttachmentSelectionFiles(files, category);
            }
        } else {
            if (window.handleAttachmentSelectionFiles) {
                window.handleAttachmentSelectionFiles(files, category, {
                    promoteFirstImage: true
                });
            }
        }

        e.target.value = '';
        state.imageTarget = null;
    });

    // Viewer Buttons
    const btnChangeImg = document.getElementById('btn-change-image');
    if (btnChangeImg) btnChangeImg.onclick = () => {
        state.imageTarget = 'gallery';
        imageInput.click();
    };

    const btnTakePh = document.getElementById('btn-take-photo');
    if (btnTakePh) btnTakePh.onclick = () => {
        state.imageTarget = 'gallery';
        const cam = document.getElementById('prod-camera-input');
        if (cam) cam.click();
    };

    const btnDelImg = document.getElementById('btn-delete-image');
    if (btnDelImg) {
        btnDelImg.onclick = async () => {
            await removeMainImage();
        };
    }

    // Camera Logic
    const camInput = document.getElementById('prod-camera-input');
    if (camInput) {
        camInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const category = state.currentTransitId ? 'reception' : 'product';

            if (state.imageTarget === 'gallery') {
                if (window.handleAttachmentSelectionFiles) {
                    window.handleAttachmentSelectionFiles([file], category);
                }
            } else {
                if (window.handleAttachmentSelectionFiles) {
                    window.handleAttachmentSelectionFiles([file], category, {
                        promoteFirstImage: true
                    });
                }
            }
            e.target.value = '';
            state.imageTarget = null;
        };
    }

    const btnTakePhoto = document.getElementById('btn-take-photo');
    if (btnTakePhoto && camInput) {
        btnTakePhoto.onclick = () => { closeViewer(); camInput.click(); };
    }

    // Excel Actions
    const btnExcel = document.getElementById('btn-export-excel');
    if (btnExcel) {
        btnExcel.onclick = async () => {
            const choice = await dialog.choice({
                title: 'Ações de Excel',
                choices: [
                    { value: 'export', label: '<i class="fa-solid fa-file-export"></i> Exportar Inventário', bg: 'var(--primary-color)', color: 'white' },
                    { value: 'import', label: '<i class="fa-solid fa-file-import"></i> Importar de Ficheiro', bg: 'white', color: 'var(--primary-color)', border: 'var(--primary-color)' }
                ]
            });
            if (choice === 'export') exportToExcel();
            if (choice === 'import') importFromExcel();
        };
    }

    // Filter Logic
    document.querySelectorAll('.filter-group').forEach(group => {
        group.onclick = (e) => {
            e.stopPropagation();
            const dropdown = group.querySelector('.filter-dropdown');
            document.querySelectorAll('.filter-dropdown').forEach(d => {
                if (d !== dropdown) d.classList.remove('open');
            });
            const isOpen = dropdown.classList.toggle('open');
            // ... positioning logic ...
            if (isOpen) {
                // ... focus logic ...
                const inp = dropdown.querySelector('input');
                if (inp) { inp.value = ''; inp.focus(); dropdown.querySelectorAll('.dropdown-item').forEach(i => i.style.display = 'flex'); }
            }
        };
    });

    // Internal Search for Dropdowns
    document.querySelectorAll('.dropdown-search input').forEach(input => {
        input.addEventListener('click', e => e.stopPropagation());
        input.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const items = e.target.closest('.filter-dropdown').querySelectorAll('.dropdown-item');
            items.forEach(item => {
                const text = item.textContent.toLowerCase();
                if (item.dataset.value === 'all' || text.includes(term)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    });

    document.addEventListener('click', () => {
        document.querySelectorAll('.filter-dropdown').forEach(d => d.classList.remove('open'));
    });

    const btnClearFilters = document.getElementById('btn-clear-filters');
    if (btnClearFilters) {
        btnClearFilters.onclick = () => {
            state.filterState = { status: 'all', category: 'all', box: 'all', pallet: 'all' };
            state.currentFilter = '';
            if (searchInput) searchInput.value = '';

            // Update UI Labels
            document.querySelectorAll('.filter-group').forEach(g => {
                g.classList.remove('active-filter');
                const type = g.id.replace('group-', '');
                // reset label logic...
                const l = g.querySelector('.filter-label');
                if (l) {
                    if (type === 'status') l.textContent = 'Todos os Estados';
                    if (type === 'category') l.textContent = 'Todos os Types';
                    if (type === 'box') l.textContent = 'Todas as Caixas';
                    if (type === 'pallet') l.textContent = 'Todas as Paletes';
                }
            });

            document.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('selected'));
            document.querySelectorAll('[data-value="all"]').forEach(i => i.classList.add('selected'));

            const btnPrintPallet = document.getElementById('btn-print-pallet');
            if (btnPrintPallet) btnPrintPallet.style.display = 'none';

            const btnPrintBox = document.getElementById('btn-print-box');
            if (btnPrintBox) btnPrintBox.style.display = 'none';

            loadInventory();
        };
    }

    // Call Setup Functions
    setupQuickScanEvents();
    setupAutocomplete();

    setupGenericAutocomplete('prod-category', 'category-suggestions', 'category');
    setupGenericAutocomplete('prod-location', 'location-suggestions', 'location');
    setupGenericAutocomplete('prod-pallet', 'pallet-suggestions', 'pallet');
    setupDragToScroll();
}

function setupDragToScroll() {
    const containers = ['.table-wrapper', '.folder-items', '.inventory-container', '.pdf-preview-container'];

    // Using delegation because some tables are rendered dynamically later
    document.addEventListener('mousedown', (e) => {
        const container = e.target.closest(containers.join(','));
        if (!container) return;

        // Don't drag if clicking buttons, inputs or links
        if (['BUTTON', 'INPUT', 'A', 'I'].includes(e.target.tagName)) return;

        let isDown = true;
        const startX = e.pageX - container.offsetLeft;
        const scrollLeft = container.scrollLeft;

        const onMouseMove = (ev) => {
            if (!isDown) return;
            ev.preventDefault();
            const x = ev.pageX - container.offsetLeft;
            const walk = (x - startX) * 2; // Scroll speed
            container.scrollLeft = scrollLeft - walk;
        };

        const onMouseUp = () => {
            isDown = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            container.classList.remove('dragging');
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        container.classList.add('dragging');
    });
}

// Scanner Functions
function startScanner() {
    scannerModal.classList.add('open');
    if (html5QrcodeScanner) return;

    try {
        const html5QrCode = new Html5Qrcode('reader');
        html5QrcodeScanner = html5QrCode;

        showToast('A iniciar câmara...', 'info');
        // Mobile optimization: prefer environment camera
        const config = { fps: 10, qrbox: { width: 250, height: 250 } };

        html5QrCode.start({ facingMode: 'environment' }, config, onScanSuccess)
            .catch(err => {
                console.error('Error starting scanner', err);
                showToast('Erro ao iniciar câmara: ' + err, 'error');
                scannerModal.classList.remove('open');
                html5QrcodeScanner = null;
            });
    } catch (e) {
        console.error('Scanner Lib Error', e);
        showToast('Erro biblioteca scanner.', 'error');
    }
}

function stopScanner() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            html5QrcodeScanner.clear();
            html5QrcodeScanner = null;
        }).catch(err => console.error(err));
    }
}

async function onScanSuccess(decodedText) {
    const cleanText = decodedText.trim();
    console.log(`Scan: ${cleanText}`);
    scannerModal.classList.remove('open');
    stopScanner();

    const { secureFetch } = await import('./data.js');

    // 1. Pallet Check
    let palletMatch = state.products.find(p => p.pallet === cleanText);
    if (!palletMatch) {
        const { data } = await secureFetch('products', { eq: { pallet: cleanText } });
        if (data && data.length > 0) palletMatch = data[0];
    }

    if (palletMatch) {
        showToast(`Palete ${cleanText} detetada!`, 'success');
        navigateTo('inventory');
        state.filterState.pallet = cleanText;

        const group = document.getElementById('group-pallet');
        if (group) {
            group.classList.add('active-filter');
            const l = group.querySelector('.filter-label');
            if (l) l.textContent = cleanText;
        }
        loadInventory();
        return;
    }

    // 1.5 Box Check
    let boxMatch = state.products.find(p => p.box === cleanText);
    if (!boxMatch) {
        const { data } = await secureFetch('products', { eq: { box: cleanText } });
        if (data && data.length > 0) boxMatch = data[0];
    }

    if (boxMatch) {
        showToast(`Caixa ${cleanText} detetada!`, 'success');
        navigateTo('inventory');
        state.filterState.box = cleanText;

        const group = document.getElementById('group-box');
        if (group) {
            group.classList.add('active-filter');
            const l = group.querySelector('.filter-label');
            if (l) l.textContent = cleanText;
        }
        loadInventory();
        return;
    }

    // 2. Product Check
    let match = state.products.find(p => String(p.id) === cleanText || (p.part_number && p.part_number.toLowerCase() === cleanText.toLowerCase()));

    if (!match) {
        // Try DB lookup by ID
        if (!isNaN(cleanText)) {
            const { data } = await secureFetch('products', { eq: { id: parseInt(cleanText) } });
            if (data && data.length > 0) match = data[0];
        }
        // Try DB lookup by PN
        if (!match) {
            const { data } = await secureFetch('products', { eq: { part_number: cleanText.toUpperCase() } });
            if (data && data.length > 0) match = data[0];
        }
    }

    if (match) {
        openEditModal(match);
        showToast('Produto encontrado!', 'success');
    } else {
        if (confirm('Produto não encontrado. Criar novo?')) {
            closeModal();
            openModal();
            const pnInput = document.getElementById('prod-part-number');
            if (pnInput) pnInput.value = cleanText;
        }
    }
}

async function exportToExcel() {
    if (!state.products.length) return showToast('Sem dados para exportar.', 'info');
    if (!window.ExcelJS) return showToast('A carregar biblioteca Excel, aguarde...', 'warning');

    const confirmed = await dialog.confirm({
        title: 'Gerar Excel',
        message: 'Deseja exportar a base de dados de inventário para um ficheiro Excel (.xlsx)?',
        confirmText: 'Gerar Ficheiro',
        type: 'info'
    });

    if (!confirmed) return;

    try {
        const workbook = new window.ExcelJS.Workbook();
        workbook.creator = 'ASP Stock App';
        const worksheet = workbook.addWorksheet('Inventário');

        // Collect translation mapping and keys
        const colMap = state.columnSettings || {};
        const labels = {
            photo: 'Foto', part_number: 'Referência', name: 'Designação', location: 'Nave', box: 'Caixa', pallet: 'Palete',
            category: 'Modelo', sales_process: 'Processo', cost_price: 'Preço Custo', quantity: 'Quantidade', status: 'Estado',
            id: 'ID', created_at: 'Criado Em', brand: 'Marca', min_quantity: 'Stock Mínimo', description: 'Comentários', maker: 'Fabricante',
            equipment: 'Equipamento', updated_at: 'Atualizado Em', order_to: 'Encomendado A', order_date: 'Data Encomenda',
            ship_plant: 'Ship Plant', delivery_time: 'Tempo Entrega', local_price: 'Preço Local', author: 'Autor'
        };

        const allKeys = new Set();
        state.products.forEach(p => Object.keys(p).forEach(k => allKeys.add(k)));
        const headers = Array.from(allKeys).filter(k => k !== 'attachments' && k !== 'is_deleted' && k !== 'image_url');

        worksheet.columns = headers.map(h => ({
            header: (labels[h] || h).toUpperCase(),
            key: h,
            width: h === 'name' || h === 'description' ? 40 : 20
        }));

        // Style Header Row
        const headerRow = worksheet.getRow(1);
        headerRow.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
            cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, family: 2, size: 11 };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });

        // Add Data
        state.products.forEach((p, index) => {
            const rowData = {};
            headers.forEach(h => {
                let val = p[h];
                if (val === null || val === undefined) val = '';
                if (h === 'cost_price' || h === 'quantity' || h === 'min_quantity') val = Number(val) || 0;
                rowData[h] = val;
            });
            const row = worksheet.addRow(rowData);

            const isEven = index % 2 === 0;
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFEEEEEE' } },
                    bottom: { style: 'thin', color: { argb: 'FFEEEEEE' } },
                    left: { style: 'thin', color: { argb: 'FFEEEEEE' } },
                    right: { style: 'thin', color: { argb: 'FFEEEEEE' } }
                };
                if (!isEven) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }; // Light gray
                }
                cell.alignment = { vertical: 'middle', horizontal: typeof cell.value === 'number' ? 'right' : 'left' };
            });
        });

        worksheet.autoFilter = { from: 'A1', to: { row: 1, column: headers.length } };

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `ASP_Stock_${new Date().toISOString().split('T')[0]}.xlsx`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('Exportado para Excel com sucesso!', 'success');
    } catch (err) {
        console.error('Erro Excel:', err);
        showToast('Erro ao exportar: ' + err.message, 'error');
    }
}

// Quick Scan
let currentQuickProduct = null;
function setupQuickScanEvents() {
    const qsClose = document.getElementById('close-quick-scan');
    if (qsClose) qsClose.onclick = () => {
        if (qsModal) qsModal.classList.remove('open');
        currentQuickProduct = null;
    };

    const btnSaveLoc = document.getElementById('qs-btn-save-loc');
    if (btnSaveLoc) {
        btnSaveLoc.onclick = async () => {
            if (!currentQuickProduct) return;
            const newLoc = document.getElementById('qs-location').value;
            if (newLoc === currentQuickProduct.location) return;

            const { error } = await supabase.from('products').update({ location: newLoc }).eq('id', currentQuickProduct.id);
            if (!error) {
                currentQuickProduct.location = newLoc;
                showToast('Localização guardada!', 'success');
                const p = state.products.find(x => x.id === currentQuickProduct.id);
                if (p) p.location = newLoc;
                loadInventory();
            } else {
                showToast('Erro ao guardar localização.', 'error');
            }
        };
    }

    // Quick Stock Buttons
    document.querySelectorAll('.btn-quick-stock').forEach(btn => {
        btn.onclick = async () => {
            if (!currentQuickProduct) return;
            const delta = parseInt(btn.dataset.delta);
            const supplier = document.getElementById('qs-supplier')?.value;
            const price = document.getElementById('qs-unit-price')?.value;

            try {
                // Using window.updateStock to leverage existing logic
                if (window.updateStock) {
                    await window.updateStock(currentQuickProduct.id, delta, price ? parseFloat(price) : null, supplier);
                    document.getElementById('qs-qty-display').textContent = currentQuickProduct.quantity; // Update display
                }
            } catch (e) { console.error(e); }
        };
    });
}
// Note: openQuickScanModal is called by... where?
// In app.js it was called if match? No, app.js changed to openEditModal.
// Is quick scan still used?
// The user summary said "Scanning a product directly opens the full product edit modal".
// So quick scan modal might be deprecated or only used manually?
// I will leave logic but `onScanSuccess` calls `openEditModal`.

function setupAutocomplete() {
    const input = document.getElementById('prod-part-number');
    const box = document.getElementById('part-number-suggestions');
    if (!input || !box) return;

    input.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        box.innerHTML = ''; box.classList.remove('active');
        if (val.length < 1) return;

        const matches = state.products.filter(p => p.part_number && p.part_number.toLowerCase().includes(val)).slice(0, 5);
        if (matches.length > 0) {
            box.classList.add('active');
            matches.forEach(m => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.innerHTML = `<span class="suggestion-code">${m.part_number}</span> <span>${m.name}</span>`;
                div.onclick = () => {
                    openEditModal(m);
                    box.innerHTML = ''; box.classList.remove('active');
                };
                box.appendChild(div);
            });
        }
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !box.contains(e.target)) box.classList.remove('active');
    });
}

function setupGenericAutocomplete(inputId, boxId, key) {
    const input = document.getElementById(inputId);
    const box = document.getElementById(boxId);
    if (!input || !box) return;

    input.addEventListener('input', () => {
        const val = input.value.toLowerCase();
        const uniqueValues = [...new Set(state.products.map(p => p[key]).filter(Boolean))];
        const filtered = uniqueValues.filter(v => v.toLowerCase().includes(val));

        if (!filtered.length) {
            box.innerHTML = '';
            box.classList.remove('active');
            return;
        }

        box.innerHTML = filtered.map(v => `
        <div class="suggestion-item">
            <span class="suggestion-name">${v}</span>
        </div>
        `).join('');
        box.classList.add('active');

        box.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                input.value = item.textContent.trim();
                box.classList.remove('active');
            });
        });
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !box.contains(e.target)) {
            box.classList.remove('active');
        }
    });
}
async function importFromExcel() {
    if (!window.ExcelJS) return showToast('A carregar biblioteca Excel, aguarde...', 'warning');

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx'; // .xls causes "central directory" error in ExcelJS
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            showToast('A analisar ficheiro...', 'info');

            // Quick check for Zip Format (PK header) to avoid Central Directory error in ExcelJS
            const reader = new FileReader();
            reader.onload = async (event) => {
                const fullBuffer = event.target.result;
                const arr = new Uint8Array(fullBuffer).subarray(0, 8);
                const headerMagic = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');

                let password = null;
                if (headerMagic.startsWith('d0cf11e0')) {
                    const { dialog } = await import('./dialogs.js');
                    password = await dialog.prompt({
                        title: 'Ficheiro Protegido',
                        message: 'Este ficheiro parece estar encriptado ou protegido por password. Introduza a password para tentar abrir:',
                        placeholder: 'Password do Excel...',
                        inputType: 'password'
                    });
                    if (!password) return;
                }

                if (!headerMagic.startsWith('504b0304') && !password) {
                    showToast('Ficheiro inválido. Certifique-se que é um Excel (.xlsx) não protegido.', 'error');
                    return;
                }

                try {
                    const workbook = new window.ExcelJS.Workbook();

                    // The @zurmokeeper fork strictly requires a Node-style Buffer for encrypted OLE2 files.
                    // We use the buffer polyfill to wrap the ArrayBuffer.
                    const { Buffer } = await import('https://cdn.jsdelivr.net/npm/buffer@6.0.3/+esm');
                    const workbookBuffer = Buffer.from(fullBuffer);

                    await workbook.xlsx.load(workbookBuffer, { password });

                    let sheet = workbook.worksheets[0];
                    if (workbook.worksheets.length > 1) {
                        const sheetChoices = workbook.worksheets.map((s, idx) => ({ value: idx, label: s.name }));
                        const chosenIdx = await dialog.choice({
                            title: 'Selecione a Tab (Folha)',
                            choices: sheetChoices
                        });
                        if (chosenIdx === null) return;
                        sheet = workbook.worksheets[chosenIdx];
                    }

                    const headerRow = sheet.getRow(1);
                    if (!headerRow || !headerRow.values.length) throw new Error('Ficheiro parece estar vazio ou sem cabeçalhos na linha 1.');

                    const excelColumns = [];
                    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
                        excelColumns.push({ name: cell.text, index: colNumber });
                    });

                    showMappingModal(sheet, excelColumns);
                } catch (innerErr) {
                    console.error('ExcelJS Load Error:', innerErr);
                    showToast('Erro ao processar conteúdo do Excel: ' + innerErr.message, 'error');
                }
            };
            reader.readAsArrayBuffer(file);

        } catch (err) {
            console.error('Import Error:', err);
            showToast('Erro ao ler Excel: ' + err.message, 'error');
        }
    };
    input.click();
}

async function showMappingModal(sheet, excelColumns) {
    const modal = document.getElementById('modal-excel-import');
    const mappingList = document.getElementById('excel-mapping-list');
    if (!modal || !mappingList) return;

    // Fields to map
    const appFields = [
        { key: 'part_number', label: 'Referência / PN *', required: true },
        { key: 'name', label: 'Designação / Nome *', required: true },
        { key: 'brand', label: 'Marca / Brand', required: false },
        { key: 'quantity', label: 'Quantidade', required: false },
        { key: 'cost_price', label: 'Preço de Custo', required: false },
        { key: 'location', label: 'Nave / Local', required: false },
        { key: 'box', label: 'Caixa', required: false },
        { key: 'pallet', label: 'Palete', required: false },
        { key: 'category', label: 'Modelo', required: false },
        { key: 'sales_process', label: 'Processo', required: false },
        { key: 'description', label: 'Comentários', required: false },
        { key: 'order_to', label: 'Fornecedor', required: false }
    ];

    mappingList.innerHTML = appFields.map(f => `
        <div class="mapping-row" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; align-items:center; padding:8px; border-bottom:1px solid #f1f5f9;">
            <label style="font-size:0.85rem; font-weight:600;">${f.label}</label>
            <select class="mapping-select" data-app-key="${f.key}" data-required="${f.required}" style="padding:6px; border-radius:6px; border:1px solid #e2e8f0; font-size:0.85rem;">
                <option value="">(Ignorar)</option>
                ${excelColumns.map(ec => {
        // Smart suggest mapping
        const lowerLabel = f.label.toLowerCase();
        const lowerEc = ec.name.toLowerCase();
        const matches = lowerEc.includes(lowerLabel) || lowerLabel.includes(lowerEc) ||
            (f.key === 'part_number' && (lowerEc.includes('ref') || lowerEc.includes('pn') || lowerEc.includes('codigo') || lowerEc.includes('código'))) ||
            (f.key === 'name' && (lowerEc.includes('design') || lowerEc.includes('nome') || lowerEc.includes('descrição') || lowerEc.includes('descricao'))) ||
            (f.key === 'quantity' && (lowerEc === 'qty' || lowerEc === 'qtd')) ||
            (f.key === 'cost_price' && (lowerEc === 'uni' || lowerEc === 'unit' || lowerEc === 'preco' || lowerEc === 'preço')) ||
            (f.key === 'description' && (lowerEc.includes('informações') || lowerEc.includes('info') || lowerEc.includes('coment'))) ||
            (f.key === 'category' && (lowerEc.includes('modelo') || lowerEc.includes('type')));
        return `<option value="${ec.index}" ${matches ? 'selected' : ''}>${ec.name}</option>`;
    }).join('')}
            </select>
        </div>
    `).join('');

    modal.classList.add('open');

    document.getElementById('btn-confirm-import').onclick = async () => {
        const mappings = {};
        let missingRequired = false;

        mappingList.querySelectorAll('.mapping-select').forEach(sel => {
            if (sel.value) mappings[sel.dataset.appKey] = parseInt(sel.value);
            else if (sel.dataset.required === 'true') missingRequired = true;
        });

        if (missingRequired) return showToast('Preencha os campos obrigatórios (*)', 'warning');

        modal.classList.remove('open');
        showGlobalLoading('A importar do Excel e criar lote...');

        try {
            const batchId = `BATCH-EXCEL-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            const items = [];
            sheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return; // Skip header

                const item = {};
                let hasData = false;
                Object.keys(mappings).forEach(appKey => {
                    const cell = row.getCell(mappings[appKey]);
                    let val = cell.value;
                    // Handle Excel formula results or objects
                    if (val && typeof val === 'object') {
                        if (val.result !== undefined) val = val.result;
                        else if (val.richText !== undefined) val = val.richText.map(t => t.text).join('');
                        else if (val.text !== undefined) val = val.text;
                        else if (val instanceof Date) val = val.toISOString().split('T')[0];
                        else val = String(val); // Fallback to string just in case
                    }
                    if (val !== undefined && val !== null) {
                        if (typeof val === 'string') val = val.trim();
                        item[appKey] = val;
                        hasData = true;
                    }
                });

                if (hasData) {
                    // Type conversion safety
                    if (item.quantity) item.quantity = Number(item.quantity) || 0;
                    if (item.cost_price) item.cost_price = Number(item.cost_price) || 0;

                    // Final validation: Ensure Name and PN are not blank (mandatory in DB)
                    // If missing, apply fallback values instead of skipping.
                    const finalName = (item.name || '').toString().trim() || 'Sem Designação (Auto)';
                    const finalPN = (item.part_number || '').toString().trim() || 'Sem Referência';

                    items.push({
                        min_quantity: 0,
                        ...item,
                        name: finalName,
                        part_number: finalPN,
                        status: 'available',
                        batch_id: batchId
                    });
                }
            });

            if (items.length === 0) throw new Error('Não foram encontrados dados para importar.');

<<<<<<< HEAD
            const { data: count, error } = await supabase.rpc('secure_batch_import', {
                p_user: state.currentUser.username,
                p_pass: state.currentUser.password,
                p_target: 'products',
                p_items: items,
                p_label: 'Importação Excel (Manual)',
                p_summary: `${items.length} itens importados via Excel manual para Inventario`,
                p_details: {
                    source: 'excel_manual',
                    source_label: 'Excel Manual',
                    destination: 'inventory',
                    destination_label: 'Inventario',
                    file_name: file.name,
                    table: 'products'
                }
=======
            // Use chunked import to avoid Cloudflare D1 statement limits
            const importId = crypto.randomUUID();
            const CHUNK_SIZE = 200;
            const totalChunks = Math.ceil(items.length / CHUNK_SIZE);

            // Create import history record
            await supabase.rpc('rpc', {
                rpc: 'create_import_history',
                p_import_id: importId,
                p_table_name: 'products',
                p_file_name: file.name,
                p_file_size: file.size
            });

            let totalInserted = 0;
            let totalFailed = 0;

            for (let ci = 0; ci < totalChunks; ci++) {
                const start = ci * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, items.length);
                const chunk = items.slice(start, end);

                const params = {
                    rpc: 'secure_chunked_import',
                    p_import_id: importId,
                    p_chunk_index: ci,
                    p_chunk_data: chunk,
                    p_total_chunks: totalChunks,
                    p_table_name: 'products',
                    p_file_name: file.name,
                    p_file_size: file.size,
                    p_user: state.currentUser?.username,
                    p_pass: state.currentUser?.password
                };

                const { data: chunkRes, error: chunkErr } = await supabase.rpc('rpc', params);
                if (chunkErr) {
                    console.error(`Chunk ${ci} import error:`, chunkErr);
                    totalFailed += chunk.length;
                } else {
                    totalInserted += chunkRes.inserted || 0;
                    totalFailed += chunkRes.failed || 0;
                }

                // Update user-visible progress
                showToast(`Importados: ${totalInserted} | Falhados: ${totalFailed}`, 'info');
            }

            // Finalize import
            await supabase.rpc('rpc', {
                rpc: 'finalize_import',
                p_import_id: importId,
                p_total_inserted: totalInserted,
                p_total_failed: totalFailed,
                p_status: totalFailed > 0 ? 'completed_with_errors' : 'completed',
                p_user: state.currentUser?.username,
                p_pass: state.currentUser?.password
>>>>>>> 3ea5bf4 (staging: commit events and PHC fallback changes for usage view)
            });

            if (error) throw error;

            showToast(`${count} itens importados com sucesso!`, 'success');
            loadInventory();

        } catch (err) {
            console.error('Import process error:', err);
            showToast('Erro no processamento: ' + err.message, 'error');
        } finally {
            hideGlobalLoading();
        }
    };
}

window.importFromExcel = importFromExcel;
window.exportToExcel = exportToExcel;
window.openUserModal = openUserModal;
window.navigateTo = navigateTo;

// PHC Import button event
document.addEventListener('click', (e) => {
    if (e.target.closest('.trigger-phc-import')) {
        e.preventDefault();
        if (window.resetPhcImport) {
            window.resetPhcImport();
        }
        const modal = document.getElementById('phc-import-modal');
        if (modal) {
            modal.classList.add('open');
            setTimeout(() => {
                const input = document.getElementById('phc-process-input');
                if (input) input.focus();
            }, 100);
        }
    }
});
