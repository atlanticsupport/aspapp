import { state } from '../core/state.js';
import { supabase } from '../supabase-client.js';
import { showToast } from '../core/ui.js';

/**
 * FETCH PRODUCTS (SECURE RPC VERSION)
 */
export async function fetchProducts(options = {}) {
    if (!supabase || !state.currentUser) return { data: [], count: 0 };

    console.time('[DATA] fetchProducts Secure');

    const { data, error } = await supabase.rpc('secure_fetch_inventory', {
        p_user: state.currentUser.username,
        p_pass: state.currentUser.password,
        p_search: state.currentFilter || '',
        p_category: state.filterState.category || 'all',
        p_location: state.filterState.location || 'all',
        p_only_transit: false
    });

    console.timeEnd('[DATA] fetchProducts Secure');

    if (error) {
        console.error('Security Block:', error.message);
        showToast('Erro de Segurança: Acesso negado aos dados.', 'error');
        return { data: [], count: 0 };
    }

    state.products = data || [];
    state.totalInventoryCount = state.products.length;

    return { data: state.products, count: state.totalInventoryCount };
}

/**
 * RECORD MOVEMENT (SECURE RPC VERSION)
 */
export async function recordMovement(productId, quantity, reason, unitPrice = null, supplier = null, poNumber = null, documentUrl = null, type = 'IN') {
    if (!state.currentUser) return;

    // Converte para Number para garantir que o banco recebe BigInt/Integer correto
    const pId = typeof productId === 'string' ? parseInt(productId) : productId;

    const movementData = {
        product_id: pId,
        type: type || (quantity > 0 ? 'IN' : 'OUT'),
        quantity: Math.abs(quantity),
        reason: reason,
        unit_price: unitPrice,
        supplier: supplier,
        po_number: poNumber
    };

    const { error } = await supabase.rpc('secure_record_movement', {
        p_user: state.currentUser.username,
        p_pass: state.currentUser.password,
        p_data: movementData
    });

    if (error) {
        console.error('Movement Security Block:', error.message);
        showToast('Erro: Não tem permissão para registar movimentos.', 'error');
    }
}

/**
 * FETCH ALL PROCESSES FOR AUTOCOMPLETE
 */
export async function fetchAllProcesses() {
    if (!supabase || !state.currentUser) return;
    const start = performance.now();

    try {
        // Optimization: We only need the process IDs, not the full product objects
        const [phcRes, invRes] = await Promise.all([
            supabase.rpc('secure_fetch_phc_ids', {
                p_user: state.currentUser.username,
                p_pass: state.currentUser.password
            }),
            supabase.rpc('secure_fetch_any', {
                p_user: state.currentUser.username,
                p_pass: state.currentUser.password,
                p_table: 'products',
                p_params: { select: 'sales_process' } // Ideally the RPC should handle this
            })
        ]);

        const processes = new Set();
        if (phcRes.data) phcRes.data.forEach(p => { if (p.processo_id) processes.add(p.processo_id); });
        if (invRes.data) invRes.data.forEach(p => { if (p.sales_process) processes.add(p.sales_process); });

        state.allProcesses = Array.from(processes).filter(Boolean).sort();
        const end = performance.now();
        console.log(`[DATA] Loaded ${state.allProcesses.length} unique processes in ${(end - start).toFixed(2)}ms.`);
    } catch (err) {
        console.error('Error fetching processes:', err);
    }
}

export async function processImageForUpload(file) {
    if (file.type === 'image/webp' || file.type === 'application/pdf') return file;

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;

        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const MAX_WIDTH = 1200;
                const MAX_HEIGHT = 1200;

                if (width > height) {
                    if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                } else {
                    if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Conversion failed'));
                }, 'image/webp', 0.85);
            };
            img.onerror = reject;
            img.src = reader.result;
        };

        reader.readAsDataURL(file);
    });
}

/**
 * GENERIC SECURE FETCH (The "Intelligent System")
 * Allows fetching from any table via the secure proxy RPC
 */
export async function secureFetch(table, options = {}) {
    if (!state.currentUser) return { data: [], error: { message: 'No Auth' } };

    const { data, error } = await supabase.rpc('secure_fetch_any', {
        p_user: state.currentUser.username,
        p_pass: state.currentUser.password,
        p_table: table,
        p_params: options
    });

    return { data: data || [], error };
}
