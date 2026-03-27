// Enhanced Excel Import Module - Handles Large Files with Chunking
import { supabase } from '../supabase-client.js';
import { state } from '../core/state.js';
import { showToast } from '../core/ui.js';
import { dialog } from '../ui/dialogs-original.js';

class ExcelImporter {
    constructor() {
        this.currentImport = null;
        this.chunkSize = 1000; // Items per chunk
        this.maxRetries = 3;
    }

    async importExcelFile(file, tableName = 'products') {
        try {
            // Validate file
            if (!file || !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
                throw new Error('Por favor selecione um ficheiro Excel válido (.xlsx ou .xls)');
            }

            // Create import session
            const importId = crypto.randomUUID();
            this.currentImport = {
                id: importId,
                fileName: file.name,
                fileSize: file.size,
                tableName: tableName,
                startTime: new Date(),
                status: 'reading'
            };

            // Show progress dialog
            this.showImportProgress();

            // Read Excel file
            const data = await this.readExcelFile(file);

            if (!data || data.length === 0) {
                throw new Error('O ficheiro Excel está vazio ou não pôde ser lido');
            }

            // Update import info
            this.currentImport.totalItems = data.length;
            this.currentImport.status = 'importing';

            // Start chunked import
            await this.processChunks(data, tableName);

            // Show completion
            this.showImportComplete();

        } catch (error) {
            console.error('Import error:', error);
            showToast(`Erro na importação: ${error.message}`, 'error');
            this.hideImportProgress();
        }
    }

    async readExcelFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;

                    // Prefer ExcelJS when available to extract styles (cell fills)
                    if (typeof ExcelJS !== 'undefined' && ExcelJS && ExcelJS.Workbook) {
                        const workbook = new ExcelJS.Workbook();
                        await workbook.xlsx.load(arrayBuffer);
                        const worksheet = workbook.worksheets[0];
                        if (!worksheet) return resolve([]);

                        // Read headers (first row)
                        const headerRow = worksheet.getRow(1);
                        const headers = [];
                        headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
                            headers[colNumber - 1] = (cell.value || '').toString();
                        });

                        if (!headers || headers.length === 0) return reject(new Error('O Excel precisa ter pelo menos uma linha de cabeçalho e uma de dados'));

                        const result = [];
                        worksheet.eachRow((row, rowNumber) => {
                            if (rowNumber === 1) return; // skip headers
                            const obj = {};
                            const cellColors = {};

                            headers.forEach((header, index) => {
                                if (!header) return;
                                const cleanHeader = header.toLowerCase()
                                    .replace(/[^a-z0-9_]/g, '_')
                                    .replace(/_+/g, '_')
                                    .replace(/^_|_$/g, '');

                                const cell = row.getCell(index + 1);
                                let val = cell && (cell.value !== undefined ? cell.value : null);
                                if (val && typeof val === 'object' && val.richText) {
                                    // RichText from exceljs
                                    val = val.richText.map(t => t.text).join('');
                                }

                                obj[cleanHeader] = val;

                                // Extract fill color if present (ARGB) and convert to hex
                                try {
                                    const fill = cell && cell.fill;
                                    if (fill && fill.fgColor && (fill.fgColor.argb || fill.fgColor.rgb)) {
                                        const argb = fill.fgColor.argb || fill.fgColor.rgb;
                                        const hex = argbToHex(argb);
                                        cellColors[cleanHeader] = hex;
                                    }
                                } catch (e) {
                                    // ignore color parsing errors
                                }
                            });

                            // attach cell color map for this row
                            if (Object.keys(cellColors).length) obj.__cellColors = cellColors;
                            // include only non-empty rows
                            if (Object.keys(obj).length > 0) result.push(obj);
                        });

                        resolve(result);
                        return;
                    }

                    // Fallback to SheetJS parsing (no styles)
                    const data = new Uint8Array(arrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { raw: true, defval: null, header: 1 });
                    if (jsonData.length < 2) return reject(new Error('O Excel precisa ter pelo menos uma linha de cabeçalho e uma de dados'));
                    const headers = jsonData[0];
                    const rows = jsonData.slice(1);
                    const result = rows.map(row => {
                        const obj = {};
                        headers.forEach((header, index) => {
                            if (header && typeof header === 'string') {
                                const cleanHeader = header.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
                                obj[cleanHeader] = row[index];
                            }
                        });
                        return obj;
                    }).filter(row => Object.keys(row).length > 0);
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            };

            reader.onerror = () => reject(new Error('Erro ao ler o ficheiro'));
            reader.readAsArrayBuffer(file);
        });
    }

function argbToHex(argb) {
    if (!argb) return null;
    let s = String(argb).replace(/^0x/, '').replace(/^#/, '');
    if (s.length === 8) s = s.slice(2);
    if (s.length !== 6) return null;
    return `#${s.toUpperCase()}`;
}

    async processChunks(data, tableName) {
        const totalChunks = Math.ceil(data.length / this.chunkSize);
        let processedChunks = 0;
        let totalInserted = 0;
        let totalFailed = 0;

        // Create import history record
        await this.createImportHistory();

        for (let i = 0; i < totalChunks; i++) {
            const start = i * this.chunkSize;
            const end = Math.min(start + this.chunkSize, data.length);
            const chunk = data.slice(start, end);

            try {
                // Process chunk with retry logic
                const result = await this.processChunk(chunk, i, totalChunks, tableName);

                processedChunks++;
                totalInserted += result.inserted || 0;
                totalFailed += result.failed || 0;

                // Update progress
                this.updateProgress(processedChunks, totalChunks, totalInserted, totalFailed);

                // Small delay to prevent overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (error) {
                console.error(`Chunk ${i} failed:`, error);
                totalFailed += chunk.length;

                // Continue with next chunk
                processedChunks++;
                this.updateProgress(processedChunks, totalChunks, totalInserted, totalFailed);
            }
        }

        // Final update
        await this.finalizeImport(totalInserted, totalFailed);
    }

    async processChunk(chunk, chunkIndex, totalChunks, tableName) {
        const params = {
            rpc: 'secure_chunked_import',
            p_import_id: this.currentImport.id,
            p_chunk_index: chunkIndex,
            p_chunk_data: chunk,
            p_total_chunks: totalChunks,
            p_table_name: tableName,
            p_file_name: this.currentImport.fileName,
            p_file_size: this.currentImport.fileSize
        };

        let response;
        try {
            response = await supabase.rpc('rpc', params);
        } catch (err) {
            // Se a resposta for HTML, mostrar erro claro
            if (err && err.message && err.message.includes('<')) {
                throw new Error('Erro inesperado: resposta HTML recebida. Verifique a ligação ao servidor ou permissões.');
            }
            throw err;
        }
        const { data, error } = response;
        // Detetar resposta HTML inesperada
        if (typeof data === 'string' && data.trim().startsWith('<')) {
            throw new Error('Erro inesperado: resposta HTML recebida. O endpoint pode estar indisponível ou mal configurado.');
        }
        if (error) {
            throw new Error(error.message || 'Erro no processamento do chunk');
        }
        return data;
    }

    async createImportHistory() {
        const params = {
            rpc: 'create_import_history',
            p_import_id: this.currentImport.id,
            p_table_name: this.currentImport.tableName,
            p_file_name: this.currentImport.fileName,
            p_file_size: this.currentImport.fileSize
        };

        await supabase.rpc('rpc', params);
    }

    async finalizeImport(inserted, failed) {
        const params = {
            rpc: 'finalize_import',
            p_import_id: this.currentImport.id,
            p_total_inserted: inserted,
            p_total_failed: failed,
            p_status: failed > 0 ? 'completed_with_errors' : 'completed'
        };

        await supabase.rpc('rpc', params);
    }

    showImportProgress() {
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';
        overlay.id = 'import-progress-overlay';

        overlay.innerHTML = `
            <div class="dialog-card" style="max-width: 500px;">
                <div class="import-progress-dialog">
                    <h3>📤 Importação em Progresso</h3>
                    <div class="import-info">
                        <p><strong>Ficheiro:</strong> ${this.currentImport.fileName}</p>
                        <p><strong>Tabela:</strong> ${this.currentImport.tableName}</p>
                        <p><strong>Total de Itens:</strong> ${this.currentImport.totalItems}</p>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" id="import-progress-fill"></div>
                    </div>
                    <p id="import-progress-text" class="progress-text">A iniciar importação...</p>
                    <div class="import-stats">
                        <div class="stat-item">
                            <span class="stat-label">✅ Sucesso:</span>
                            <span class="stat-value" id="stat-success">0</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">❌ Falhados:</span>
                            <span class="stat-value" id="stat-failed">0</span>
                        </div>
                    </div>
                    <div class="dialog-actions" style="margin-top: 1.5rem;">
                        <button class="btn-secondary" onclick="window.excelImporter.cancelImport()">
                            Cancelar
                        </button>
                        <button class="btn-primary" onclick="window.excelImporter.viewHistory()" style="display:none" id="btn-view-history">
                            Ver Histórico
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        setTimeout(() => overlay.classList.add('open'), 10);
    }

    updateProgress(processed, total, inserted, failed) {
        const percent = Math.round((processed / total) * 100);
        const progressFill = document.getElementById('import-progress-fill');
        const progressText = document.getElementById('import-progress-text');
        const statSuccess = document.getElementById('stat-success');
        const statFailed = document.getElementById('stat-failed');

        if (progressFill) progressFill.style.width = `${percent}%`;
        if (progressText) progressText.textContent = `Processando: ${processed}/${total} chunks (${percent}%)`;
        if (statSuccess) statSuccess.textContent = inserted;
        if (statFailed) statFailed.textContent = failed;
    }

    showImportComplete() {
        const progressText = document.getElementById('import-progress-text');
        const btnViewHistory = document.getElementById('btn-view-history');

        if (progressText) progressText.textContent = '✅ Importação concluída!';
        if (btnViewHistory) btnViewHistory.style.display = 'inline-block';

        showToast('Importação concluída com sucesso!', 'success');

        // Auto-close after 3 seconds
        setTimeout(() => {
            const dialog = document.querySelector('.dialog-container');
            if (dialog) dialog.remove();
        }, 3000);
    }

    hideImportProgress() {
        const dialog = document.querySelector('.dialog-container');
        if (dialog) dialog.remove();
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async viewHistory() {
        // Navigate to import history page
        window.location.hash = '#import-history';
        this.hideImportProgress();
    }

    cancelImport() {
        if (confirm('Tem certeza que deseja cancelar a importação?')) {
            this.currentImport = null;
            this.hideImportProgress();
            showToast('Importação cancelada', 'info');
        }
    }
}

// Initialize global instance
window.excelImporter = new ExcelImporter();

// Export for use in other modules
export { ExcelImporter };
