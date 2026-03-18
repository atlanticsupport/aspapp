import { state } from './state.js';
import { getEntityPrimaryImageUrl } from '../gallery.js';

export function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

window.escapeHTML = escapeHTML; // Make it globally available for inline onclicks

export function formatCurrency(value) {
    if (!state.currentUser?.can_view_prices) {
        return '*** €';
    }
    const num = parseFloat(value) || 0;
    return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(num);
}

export function renderImageCellHTML(p) {
    const imgToShow = getEntityPrimaryImageUrl(p, {
        attachmentCategory: 'product',
        acceptedTypes: ['image', 'video'],
    });

    if (imgToShow) {
        return `<div class="cell-image" onclick="event.stopPropagation(); window.openProductGallery(${p.id})">
                    <img src="${imgToShow}" alt="${p.name || ''}" loading="lazy" decoding="async" onerror="this.style.display='none'">
                </div>`;
    } else {
        return `<div class="cell-image-placeholder" onclick="event.stopPropagation(); window.openProductGallery(${p.id})">
                    <i class="fa-solid fa-image"></i>
                </div>`;
    }
}

export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) {
        // Create container if not exists - this should probably be in DOM logic, 
        // but it's okay here for utility.
        const div = document.createElement('div');
        div.id = 'toast-container';
        div.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:9999; display:flex; flex-direction:column; gap:10px;';
        document.body.appendChild(div);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type} `;
    toast.innerHTML = `<span>${message}</span>`;
    document.getElementById('toast-container').appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

export function getDateRangeLabel(range) {
    switch (range) {
        case 'today': return 'Hoje';
        case '7days': return 'Últimos 7 dias';
        case '30days': return 'Últimos 30 dias';
        case 'custom': return 'Personalizado';
        default: return 'Sempre';
    }
}

export function renderPagination(currentPage, totalCount, prevFuncStr, nextFuncStr, pageSizeOverride = null) {
    const pSize = pageSizeOverride || state.PAGE_SIZE;
    if (totalCount <= pSize) return '';

    const start = currentPage * pSize + 1;
    const end = Math.min((currentPage + 1) * pSize, totalCount);

    return `
    <div class="pagination-controls" style="display:flex; justify-content:space-between; align-items:center; padding:1rem; border-top:1px solid var(--border-color);">
        <span style="font-size:0.9rem; color:var(--text-secondary);">
            A mostrar <strong>${start}-${end}</strong> de <strong>${totalCount}</strong>
        </span>
        <div style="display:flex; gap:0.5rem;">
            <button class="btn btn-secondary" onclick="${prevFuncStr}" ${currentPage === 0 ? 'disabled' : ''}>
                <i class="fa-solid fa-chevron-left"></i> Anterior
            </button>
            <button class="btn btn-secondary" onclick="${nextFuncStr}" ${end >= totalCount ? 'disabled' : ''}>
                Próximo <i class="fa-solid fa-chevron-right"></i>
            </button>
        </div>
    </div>
    `;
}

// Navigation Drag & Drop Logic
export function setupNavDragDrop() {
    const navList = document.querySelector('.nav-links');
    if (!navList) return;

    let dragSrcEl = null;

    function handleDragStart(e) {
        this.style.opacity = '0.4';
        dragSrcEl = this;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', this.innerHTML);
    }

    function handleDragOver(e) {
        if (e.preventDefault) e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    function handleDragEnter(e) {
        this.classList.add('over');
    }

    function handleDragLeave(e) {
        this.classList.remove('over');
    }

    function handleDrop(e) {
        if (e.stopPropagation) e.stopPropagation();

        if (dragSrcEl !== this) {
            // Swap logic: exchange 'data-page' and innerHTML
            const srcPage = dragSrcEl.dataset.page;
            const destPage = this.dataset.page;

            const srcHTML = dragSrcEl.innerHTML;
            const destHTML = this.innerHTML;

            dragSrcEl.innerHTML = destHTML;
            this.innerHTML = srcHTML;

            dragSrcEl.dataset.page = destPage;
            this.dataset.page = srcPage;

            // Save new order
            saveNavOrder();
        }
        return false;
    }

    function handleDragEnd(e) {
        this.style.opacity = '1';
        items.forEach(item => item.classList.remove('over'));
    }

    let items = navList.querySelectorAll('.nav-item');
    items.forEach(function (item) {
        if (item.getAttribute('draggable') !== 'true') return; // Only apply if draggable
        // Actually, we need to make them draggable if not already?
        // Let's assume user markup has draggable="true" or we add it. 
        // The previous code implied adding event listeners to .nav-item.
        item.setAttribute('draggable', 'true'); // Force enable
        item.addEventListener('dragstart', handleDragStart, false);
        item.addEventListener('dragenter', handleDragEnter, false);
        item.addEventListener('dragover', handleDragOver, false);
        item.addEventListener('dragleave', handleDragLeave, false);
        item.addEventListener('drop', handleDrop, false);
        item.addEventListener('dragend', handleDragEnd, false);
    });
}

function saveNavOrder() {
    const navList = document.querySelector('.nav-links');
    const order = [];
    Array.from(navList.children).forEach((child, index) => {
        const page = child.dataset.page;
        if (page) order.push(page);
    });

    localStorage.setItem('sidebarOrder', JSON.stringify(order));
}

export function applyNavOrder() {
    const savedOrder = JSON.parse(localStorage.getItem('navOrder'));
    if (!savedOrder) return;

    const navList = document.querySelector('.nav-links');
    const items = Array.from(navList.querySelectorAll('.nav-item'));

    // Sort items based on saved order
    items.sort((a, b) => {
        const indexA = savedOrder.indexOf(a.dataset.page);
        const indexB = savedOrder.indexOf(b.dataset.page);

        // Items not in saved order go to end
        const valA = indexA === -1 ? 999 : indexA;
        const valB = indexB === -1 ? 999 : indexB;

        return valA - valB;
    });

    // Re-append in new order
    items.forEach(item => navList.appendChild(item));

    // Re-bind events (drag drop needs rebind? No, events are attached to elements, elements moved in DOM keep events)
}

// Global Loading Overlay
export function showGlobalLoading(message = 'A processar...') {
    let overlay = document.getElementById('global-loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'global-loading-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(255, 255, 255, 0.85); z-index: 99999;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            backdrop-filter: blur(4px); font-family: var(--font-family, sans-serif);
        `;
        overlay.innerHTML = `
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 3.5rem; color: var(--primary-color, #0ea5e9); margin-bottom: 20px;"></i>
            <h3 id="global-loading-msg" style="color: var(--text-primary, #1e293b); font-weight: 600;">${message}</h3>
        `;
        document.body.appendChild(overlay);
    } else {
        document.getElementById('global-loading-msg').textContent = message;
        overlay.style.display = 'flex';
    }
}

export function hideGlobalLoading() {
    const overlay = document.getElementById('global-loading-overlay');
    if (overlay) overlay.style.display = 'none';
}

window.showGlobalLoading = showGlobalLoading;
window.hideGlobalLoading = hideGlobalLoading;
