import { state } from '../core/state.js';
import { supabase } from '../supabase-client.js';
import { showToast } from '../core/ui.js';
import { dialog } from '../ui/dialogs-original.js';
import { loadInventory } from '../inventory.js';

// PHC Core Module - Main functions and initialization
let detectedPhcItems = [];

// Helper to check if Supabase is configured
function isSupabaseConfigured() {
    return supabase && supabase.supabaseUrl && supabase.supabaseKey;
}

// Initialize PHC Import Module (setup event listeners only, don't auto-open modal)
export function initPhcImport() {
    // Setup fetch button event
    const btnFetch = document.getElementById('btn-phc-fetch');
    if (btnFetch) {
        btnFetch.onclick = () => {
            const input = document.getElementById('phc-process-input');
            if (input && input.value.trim()) {
                window.handlePhcFetch(input.value.trim());
            } else {
                showToast('Por favor, digite um número de processo.', 'warning');
            }
        };
    }
}

// Reset PHC Import form
export function resetPhcImport() {
    document.getElementById('phc-input-section').style.display = 'block';
    document.getElementById('phc-preview-container').style.display = 'none';
    document.getElementById('phc-process-input').value = '';
    const photosInput = document.getElementById('phc-bulk-photos');
    if (photosInput) photosInput.value = '';
    const previews = document.getElementById('phc-photo-previews');
    if (previews) previews.innerHTML = '';
    detectedPhcItems = [];
}

// Export detected items for use in other modules
export function getDetectedPhcItems() {
    return detectedPhcItems;
}

export function setDetectedPhcItems(items) {
    detectedPhcItems = items;
}

// Setup fetch button event immediately when module loads
document.addEventListener('DOMContentLoaded', () => {
    const btnFetch = document.getElementById('btn-phc-fetch');
    if (btnFetch && !btnFetch.hasAttribute('data-phc-setup')) {
        btnFetch.setAttribute('data-phc-setup', 'true');
        btnFetch.onclick = () => {
            const input = document.getElementById('phc-process-input');
            if (input && input.value.trim()) {
                window.handlePhcFetch(input.value.trim());
            } else {
                showToast('Por favor, digite um número de processo.', 'warning');
            }
        };
    }

    // Setup confirm import button
    const btnConfirm = document.getElementById('btn-confirm-phc-import');
    if (btnConfirm && !btnConfirm.hasAttribute('data-phc-confirm-setup')) {
        btnConfirm.setAttribute('data-phc-confirm-setup', 'true');
        btnConfirm.onclick = () => {
            if (window.confirmPhcImport) {
                window.confirmPhcImport();
            }
        };
    }
});

// Make functions available globally
window.initPhcImport = initPhcImport;
window.resetPhcImport = resetPhcImport;
