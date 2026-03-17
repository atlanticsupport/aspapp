// Cloudflare Pages - Enhanced Import Handler for Large Files
// Handles chunked imports and tracks history

export async function handleChunkedImport(env, params, user) {
    const { import_id, chunk_index, chunk_data, total_chunks, table_name, file_name, file_size } = params;
    
    // Create or update import history
    const importHistory = await db.prepare(`
        INSERT OR REPLACE INTO import_history 
        (id, user_id, user_name, table_name, total_items, status, start_time, file_name, file_size, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        import_id,
        user.id,
        user.username,
        table_name,
        0, // Will be updated
        chunk_index === 0 ? 'processing' : 'processing',
        new Date().toISOString(),
        file_name,
        file_size,
        JSON.stringify({ total_chunks, current_chunk: chunk_index + 1 })
    ).run();
    
    // Process chunk
    const CHUNK_SIZE = 100; // Increased from 40
    const insertedItems = [];
    const failedItems = [];
    
    for (let i = 0; i < chunk_data.length; i += CHUNK_SIZE) {
        const chunk = chunk_data.slice(i, i + CHUNK_SIZE);
        const stmts = [];
        
        for (const [index, item] of chunk.entries()) {
            try {
                // Validate and prepare item
                const filteredItem = validateAndPrepareItem(item, table_name);
                const keys = Object.keys(filteredItem);
                const bindings = keys.map(() => '?').join(', ');
                const vals = keys.map(k => filteredItem[k]);
                
                stmts.push(db.prepare(`
                    INSERT INTO ${table_name} (${keys.join(', ')}) 
                    VALUES (${bindings}) 
                    RETURNING id
                `).bind(...vals));
                
                // Track item
                insertedItems.push({
                    row_number: (chunk_index * chunk_data.length) + index + 1,
                    data: item
                });
            } catch (error) {
                failedItems.push({
                    row_number: (chunk_index * chunk_data.length) + index + 1,
                    error: error.message,
                    data: item
                });
            }
        }
        
        // Execute batch
        if (stmts.length > 0) {
            const batchResults = await db.batch(stmts);
            
            // Update item tracking with actual IDs
            for (let j = 0; j < batchResults.length; j++) {
                const result = batchResults[j];
                const item = insertedItems[j];
                if (item && result.results && result.results.length > 0) {
                    item.item_id = result.results[0].id;
                }
            }
        }
    }
    
    // Save item details
    const allItems = [...insertedItems, ...failedItems];
    for (const item of allItems) {
        await db.prepare(`
            INSERT INTO import_items 
            (id, import_id, row_number, item_id, status, error_message, data)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
            crypto.randomUUID(),
            import_id,
            item.row_number,
            item.item_id || null,
            item.item_id ? 'success' : 'failed',
            item.error || null,
            JSON.stringify(item.data)
        ).run();
    }
    
    // Update import history
    const isLastChunk = chunk_index === total_chunks - 1;
    const status = isLastChunk ? 'completed' : 'processing';
    
    await db.prepare(`
        UPDATE import_history 
        SET imported_items = imported_items + ?,
            failed_items = failed_items + ?,
            status = ?,
            end_time = ?
        WHERE id = ?
    `).bind(
        insertedItems.length,
        failedItems.length,
        status,
        isLastChunk ? new Date().toISOString() : null,
        import_id
    ).run();
    
    return {
        success: true,
        chunk_index,
        inserted: insertedItems.length,
        failed: failedItems.length,
        is_complete: isLastChunk
    };
}

export async function revertImport(env, params, user) {
    const { import_id } = params;
    
    // Check if user has permission
    if (user.role !== 'admin' && user.inventory_access !== 'write') {
        throw new Error("Acesso negado para reverter importação.");
    }
    
    // Get import history
    const importHistory = await db.prepare(`
        SELECT * FROM import_history 
        WHERE id = ? AND status = 'completed'
    `).bind(import_id).first();
    
    if (!importHistory) {
        throw new Error("Importação não encontrada ou não pode ser revertida.");
    }
    
    // Get all successfully imported items
    const importedItems = await db.prepare(`
        SELECT item_id, table_name FROM import_items 
        WHERE import_id = ? AND status = 'success' AND item_id IS NOT NULL
    `).bind(import_id).all();
    
    // Delete items in batches
    const BATCH_SIZE = 100;
    let deletedCount = 0;
    
    for (let i = 0; i < importedItems.length; i += BATCH_SIZE) {
        const batch = importedItems.slice(i, i + BATCH_SIZE);
        const stmts = batch.map(item => 
            db.prepare(`DELETE FROM ${importHistory.table_name} WHERE id = ?`).bind(item.item_id)
        );
        
        await db.batch(stmts);
        deletedCount += batch.length;
    }
    
    // Update import history
    await db.prepare(`
        UPDATE import_history 
        SET status = 'reverted', 
            end_time = ?
        WHERE id = ?
    `).bind(new Date().toISOString(), import_id).run();
    
    // Update items status
    await db.prepare(`
        UPDATE import_items 
        SET status = 'reverted'
        WHERE import_id = ?
    `).bind(import_id).run();
    
    // Record audit
    await recordAudit(
        importHistory.table_name,
        'BULK_DELETE',
        { count: deletedCount },
        { import_id, reverted_by: user.username }
    );
    
    return {
        success: true,
        deleted_items: deletedCount,
        import_id
    };
}

export async function getImportHistory(env, params, user) {
    const { limit = 50, offset = 0, table_name } = params;
    
    let query = `
        SELECT ih.*, 
               COUNT(ii.id) as total_items_count
        FROM import_history ih
        LEFT JOIN import_items ii ON ih.id = ii.import_id
    `;
    
    const bindings = [];
    
    if (table_name) {
        query += ' WHERE ih.table_name = ?';
        bindings.push(table_name);
    }
    
    query += `
        GROUP BY ih.id
        ORDER BY ih.created_at DESC
        LIMIT ? OFFSET ?
    `;
    
    bindings.push(limit, offset);
    
    const { results } = await db.prepare(query).bind(...bindings).all();
    
    // Get detailed items for each import if needed
    for (const importRecord of results) {
        if (params.include_details) {
            const { results: items } = await db.prepare(`
                SELECT * FROM import_items 
                WHERE import_id = ?
                ORDER BY row_number
            `).bind(importRecord.id).all();
            importRecord.items = items;
        }
    }
    
    return results;
}

function validateAndPrepareItem(item, tableName) {
    const filteredItem = {};
    
    // Get table columns (cached in production)
    const validColumns = {
        'products': ['id', 'name', 'brand', 'quantity', 'min_quantity', 'description', 'sales_process', 
                    'image_url', 'part_number', 'location', 'category', 'cost_price', 'maker', 
                    'equipment', 'pallet', 'updated_at', 'status', 'box', 'is_deleted', 
                    'order_to', 'order_date', 'ship_plant', 'delivery_time', 'local_price', 
                    'author', 'batch_id'],
        'logistics_items': ['id', 'sales_process', 'part_number', 'description', 'quantity', 
                           'status', 'received_at', 'shipped_at', 'shipped_by', 'shipment_id', 
                           'carrier', 'box_dimensions', 'box_image_url', 'urgency_level', 
                           'notes', 'is_deleted', 'created_at']
    };
    
    const validKeys = validColumns[tableName] || [];
    
    for (const key of validKeys) {
        if (item[key] !== undefined && item[key] !== null) {
            filteredItem[key] = item[key];
        }
    }
    
    // Set defaults
    if (tableName === 'products') {
        if (!filteredItem.name) filteredItem.name = 'Sem Designação (Auto)';
        if (!filteredItem.part_number) filteredItem.part_number = 'Sem Referência';
        if (!filteredItem.brand) filteredItem.brand = '-';
        if (!filteredItem.location || filteredItem.location === 'Almoxarifado') {
            filteredItem.location = '1';
        }
        if (!filteredItem.is_deleted) filteredItem.is_deleted = 0;
        if (!filteredItem.quantity) filteredItem.quantity = 0;
        if (!filteredItem.min_quantity) filteredItem.min_quantity = 5;
        if (!filteredItem.status) filteredItem.status = 'available';
        if (!filteredItem.category) filteredItem.category = 'Import';
    }
    
    if (tableName === 'logistics_items') {
        if (!filteredItem.is_deleted) filteredItem.is_deleted = 0;
        if (!filteredItem.quantity) filteredItem.quantity = 1;
        if (!filteredItem.status) filteredItem.status = 'received';
        if (!filteredItem.urgency_level) filteredItem.urgency_level = 'normal';
    }
    
    filteredItem.updated_at = new Date().toISOString();
    
    return filteredItem;
}
