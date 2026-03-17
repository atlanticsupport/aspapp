import { state } from '../core/state.js';
import { getDetectedPhcItems } from './phc-core.js';

// View-specific column definitions
const VIEW_COLUMNS = {
    // Inventory: Items already in stock with full location details
    inventory: [
        { id: 'part_number', label: 'Referência', width: '16%' },
        { id: 'name', label: 'Designação', width: '34%' },
        { id: 'quantity', label: 'Quantidade', width: '12%' },
        { id: 'pallet', label: 'Palete', width: '10%' },
        { id: 'box', label: 'Caixa', width: '10%' },
        { id: 'brand', label: 'Fabricante', width: '10%' },
        { id: 'category', label: 'Type', width: '18%' }
    ],
    // Transit/Chegadas: Items arriving, no location yet (not stored)
    transit: [
        { id: 'part_number', label: 'Referência', width: '18%' },
        { id: 'name', label: 'Designação', width: '35%' },
        { id: 'quantity', label: 'Quantidade', width: '12%' },
        { id: 'brand', label: 'Fabricante', width: '15%' },
        { id: 'category', label: 'Type', width: '20%' }
    ],
    // Stock Out: Items being picked from inventory (location chosen during picking)
    stock_out: [
        { id: 'part_number', label: 'Referência', width: '18%' },
        { id: 'name', label: 'Designação', width: '35%' },
        { id: 'quantity', label: 'Quantidade', width: '12%' },
        { id: 'brand', label: 'Fabricante', width: '15%' },
        { id: 'category', label: 'Type', width: '20%' }
    ],
    // Logistics: Items in transit to client (no internal location needed)
    logistics: [
        { id: 'part_number', label: 'Referência', width: '16%' },
        { id: 'name', label: 'Designação', width: '32%' },
        { id: 'quantity', label: 'Quantidade', width: '12%' },
        { id: 'brand', label: 'Fabricante', width: '15%' },
        { id: 'category', label: 'Type', width: '25%' }
    ]
};

// Render PHC preview table
export function renderPhcPreview() {
    const table = document.getElementById('phc-preview-table');
    const thead = table.querySelector('thead tr');
    const tbody = table.querySelector('tbody');

    // Force table layout to auto
    table.style.tableLayout = 'auto';

    // Determine target view
    const view = state.currentPage === 'logistics' ? 'logistics' :
        state.currentPage === 'transit' ? 'transit' :
            state.currentPage === 'stock-out' ? 'stock_out' : 'inventory';

    const cols = VIEW_COLUMNS[view] || VIEW_COLUMNS.inventory;

    // Show/hide global location fields based on view
    const isInventory = view === 'inventory';
    const palletGroup = document.getElementById('phc-global-pallet-group');
    const boxGroup = document.getElementById('phc-global-box-group');
    const locationGroup = document.getElementById('phc-global-location-group');
    
    if (palletGroup) palletGroup.style.display = isInventory ? 'block' : 'none';
    if (boxGroup) boxGroup.style.display = isInventory ? 'block' : 'none';
    if (locationGroup) locationGroup.style.display = isInventory ? 'block' : 'none';

    // Render headers
    thead.innerHTML = cols.map(c => `<th style="width:${c.width}">${c.label}</th>`).join('');

    // Render rows
    const detectedPhcItems = getDetectedPhcItems();
    tbody.innerHTML = detectedPhcItems.map((item, idx) => {
        const cells = cols.map(col => {
            let value = item[col.id] || '';
            if (col.id === 'quantity' || col.id === 'cost_price') {
                value = parseFloat(value) || 0;
                if (col.id === 'cost_price') value = value.toFixed(2);
            }
            return `<td>
                <input type="text" 
                    class="phc-edit-field" 
                    data-key="${col.id}" 
                    data-row="${idx}"
                    value="${value}">
            </td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');

    // Setup global sync on change
    setupPhcGlobalSync(table);

    // Setup autocomplete for pallet/box
    setupPhcAutocomplete();
}

// Sync global meta fields to individual rows
function setupPhcGlobalSync(table) {
    const sync = (sourceId, targetKey) => {
        const source = document.getElementById(sourceId);
        if (!source) return;

        source.addEventListener('input', () => {
            table.querySelectorAll(`.phc-edit-field[data-key="${targetKey}"]`).forEach(input => {
                if (input.dataset.autoSynced !== 'false') {
                    input.value = source.value;
                }
            });
        });
    };

    sync('phc-global-location', 'location');
    sync('phc-global-pallet', 'pallet');
    sync('phc-global-box', 'box');
    sync('phc-meta-engine-type', 'category');

    // Mark manually edited fields
    if (table) {
        table.addEventListener('input', (e) => {
            if (e.target.classList.contains('phc-edit-field')) {
                e.target.dataset.autoSynced = 'false';
            }
        });
    }
}

// Setup autocomplete for pallet/box
function setupPhcAutocomplete() {
    const setup = (inputId, boxId, key) => {
        const input = document.getElementById(inputId);
        const box = document.getElementById(boxId);
        if (!input || !box) return;

        input.oninput = () => {
            const val = input.value.toLowerCase();
            const uniqueValues = [...new Set(state.products.map(p => p[key]).filter(Boolean))].sort();
            const filtered = uniqueValues.filter(v => v.toLowerCase().includes(val)).slice(0, 5);

            if (!filtered.length || val.length === 0) {
                box.innerHTML = '';
                box.classList.remove('active');
                return;
            }

            box.innerHTML = filtered.map(v => `<div class="suggestion-item">${v}</div>`).join('');
            box.classList.add('active');
            box.querySelectorAll('.suggestion-item').forEach(item => {
                item.onclick = () => {
                    input.value = item.textContent.trim();
                    box.classList.remove('active');
                };
            });
        };
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !box.contains(e.target)) box.classList.remove('active');
        });
    };

    setup('phc-global-pallet', 'phc-global-pallet-suggestions', 'pallet');
    setup('phc-global-box', 'phc-global-box-suggestions', 'box');
}

// Handle file change for photo preview
export function handlePhcFileChange(files) {
    const previewContainer = document.getElementById('phc-photo-previews');
    if (!previewContainer) return;
    previewContainer.innerHTML = '';

    if (!files || files.length === 0) return;

    for (const file of files) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.style.cssText = 'width:60px; height:60px; border-radius:4px; overflow:hidden; border:1px solid #e2e8f0; position:relative;';

            if (file.type.startsWith('video/')) {
                div.innerHTML = `
                    <video src="${e.target.result}" style="width:100%; height:100%; object-fit:cover;"></video>
                    <i class="fa-solid fa-play" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:white; font-size:0.8rem; text-shadow:0 0 4px rgba(0,0,0,0.5); pointer-events:none;"></i>
                `;
            } else {
                div.innerHTML = `<img src="${e.target.result}" style="width:100%; height:100%; object-fit:cover;">`;
            }
            previewContainer.appendChild(div);
        };
        reader.readAsDataURL(file);
    }
    showToast(`${files.length} ficheiro(s) selecionados para a importação.`, 'info');
}

// Make function available globally
window.handlePhcFileChange = handlePhcFileChange;
