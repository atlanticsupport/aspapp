import { state } from '../core/state.js';

/**
 * Autocomplete Utility for Processes
 * This module monitors inputs and shows suggestions from state.allProcesses
 */

export function initProcessAutocomplete() {
    console.log('[AUTOCOMPLETE] Initializing Process Autocomplete...');

    // Use delegation to catch dynamically created inputs (like in Transit/Logistics)
    document.addEventListener('input', (e) => {
        const input = e.target;
        if (isProcessInput(input)) {
            handleProcessInput(input);
        }
    });

    // Close suggestions on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-suggestions') && !isProcessInput(e.target)) {
            closeAllProcessSuggestions();
        }
    });
}

function isProcessInput(el) {
    if (!el || !el.id) return false;
    const ids = ['transit-search', 'logistics-search', 'phc-process-input', 'prod-process'];
    return ids.includes(el.id);
}

function handleProcessInput(input) {
    const value = input.value.trim().toLowerCase();

    // Clear existing
    const container = getOrCreateSuggestionContainer(input);
    if (!value || value.length < 1) {
        container.classList.remove('active');
        return;
    }

    let source = [];
    if (input.id === 'phc-process-input' || input.id === 'prod-process') {
        // Global suggestions for import/forms
        source = state.allProcesses;
    } else if (input.id === 'transit-search') {
        // Only what's in transit
        source = [...new Set(state.transitProducts.map(p => p.sales_process).filter(Boolean))];
    } else if (input.id === 'logistics-search') {
        // Only what's in logistics
        const logData = state.logisticsProducts || [];
        source = [...new Set(logData.map(p => p.sales_process).filter(Boolean))];
    }

    const matches = source
        .filter(p => p.toLowerCase().includes(value))
        .slice(0, 2); // Limit to 2 results as requested

    if (matches.length === 0) {
        container.classList.remove('active');
        return;
    }

    renderSuggestions(container, matches, input);
}

function getOrCreateSuggestionContainer(input) {
    let container = input.parentElement.querySelector('.autocomplete-suggestions');
    if (!container) {
        // Ensure parent has position relative
        if (getComputedStyle(input.parentElement).position === 'static') {
            input.parentElement.style.position = 'relative';
        }

        container = document.createElement('div');
        container.className = 'autocomplete-suggestions';
        input.parentElement.appendChild(container);
    }
    return container;
}

function renderSuggestions(container, matches, input) {
    container.innerHTML = matches.map(m => `
        <div class="suggestion-item" data-value="${m}">
            <span class="suggestion-code">${m}</span>
            <i class="fa-solid fa-arrow-right-long" style="font-size:0.7rem; color:#cbd5e1;"></i>
        </div>
    `).join('');

    container.classList.add('active');

    // Add click events to items
    container.querySelectorAll('.suggestion-item').forEach(item => {
        item.onclick = (e) => {
            console.log('[AUTOCOMPLETE] Suggestion clicked:', item.dataset.value);
            e.stopPropagation();
            const val = item.dataset.value;
            input.value = val;
            container.classList.remove('active');
            console.log('[AUTOCOMPLETE] Value set to:', val, 'Input ID:', input.id);

            // Trigger input event to fire existing filters
            input.dispatchEvent(new Event('input', { bubbles: true }));
            console.log('[AUTOCOMPLETE] Input event dispatched');

            // Special case for PHC Fetch (if user selects, maybe they want to trigger load?)
            if (input.id === 'phc-process-input') {
                console.log('[AUTOCOMPLETE] PHC input selected, triggering fetch...');
                const btnFetch = document.getElementById('btn-phc-fetch');
                if (btnFetch) {
                    console.log('[AUTOCOMPLETE] btnFetch found, clicking...');
                    btnFetch.click();
                } else {
                    console.log('[AUTOCOMPLETE] btnFetch not found!');
                }
            }
        };
    });
}

function closeAllProcessSuggestions() {
    document.querySelectorAll('.autocomplete-suggestions').forEach(s => s.classList.remove('active'));
}
