// Helper to get stylized label HTML
function getStyledLabelHTML(title, subtitle, barcodeValue, type = 'item') {
    const settings = JSON.parse(localStorage.getItem('labelSettings')) || { width: 5, height: 3 };
    const w = settings.width;
    const h = settings.height;

    return `
        <!DOCTYPE html>
        <html>
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
                <style>
                    @page { size: ${w}cm ${h}cm; margin: 0; }
                    * { margin:0; padding:0; box-sizing: border-box; }
                    body {
                        font-family: 'Inter', -apple-system, sans-serif;
                        width: ${w}cm;
                        height: ${h}cm;
                        overflow: hidden;
                        background: #fff;
                        color: #1e293b;
                    }
                    .label-wrapper {
                        width: 100%;
                        height: 100%;
                        padding: 1.5mm 2mm;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: space-between;
                        position: relative;
                        background: #fff;
                    }
                    .logo-header {
                        width: 100%;
                        display: flex;
                        justify-content: center;
                        margin-bottom: 2mm;
                    }
                    .logo-header img {
                        height: 5.5mm;
                        width: auto;
                        object-fit: contain;
                    }
                    .main-title {
                        font-size: ${type === 'item' ? '8.5pt' : '11.pt'};
                        font-weight: 500;
                        text-align: center;
                        line-height: 1.1;
                        width: 100%;
                        color: #0f172a;
                        margin-bottom: 0.5mm;
                    }
                    .barcode-area {
                        flex: 1;
                        width: 100%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 0;
                        padding: 0.5mm 0;
                    }
                    .barcode-svg {
                        width: auto;
                        max-width: 95%;
                        height: auto;
                        max-height: 100%;
                    }
                    .footer-info {
                        width: 100%;
                        font-size: 5.5pt;
                        font-weight: 500;
                        text-align: center;
                        color: #64748b;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        border-top: 0.1mm solid #f1f5f9;
                        padding-top: 1mm;
                        margin-top: 0.5mm;
                    }
                </style>
            </head>
            <body>
                <div class="label-wrapper">
                    <div class="logo-header">
                        <img src="logo.svg" onerror="this.style.display='none'">
                    </div>
                    
                    <div class="main-title">${title}</div>
                    
                    <div class="barcode-area">
                        <svg class="barcode-svg" id="barcode"></svg>
                    </div>

                    ${subtitle ? `<div class="footer-info">${subtitle}</div>` : ''}

                    <script>
                        JsBarcode("#barcode", "${barcodeValue}", {
                            format: "CODE128",
                            height: 35,
                            width: 2.0,
                            displayValue: true,
                            fontSize: 10,
                            font: "Inter",
                            textMargin: 0,
                            margin: 0,
                            background: "transparent",
                            lineColor: "#000"
                        });
                    <\/script>
                </div>
            </body>
        </html>
    `;
}

function sendToPrinter(html) {
    const iframe = document.createElement('iframe');
    let printed = false;
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    iframe.contentWindow.document.write(html);
    iframe.contentWindow.document.close();

    iframe.onload = function () {
        if (printed) return;
        printed = true;
        setTimeout(() => {
            iframe.contentWindow.print();
            setTimeout(() => {
                if (iframe.parentNode) document.body.removeChild(iframe);
            }, 1000);
        }, 500);
    };
}

export function printSingleLabel(product) {
    if (!product || !product.id) return showToast('Produto inválido.', 'error');
    const subtitle = `${product.brand || ''} | ${product.part_number || ''}`;
    const html = getStyledLabelHTML(product.name, subtitle, product.id, 'item');
    sendToPrinter(html);
}

export function printPalletLabel(palletName) {
    if (!palletName || palletName === 'all') return showToast('Selecione uma palete.', 'error');
    const html = getStyledLabelHTML(`PALETE: ${palletName}`, '', palletName, 'PALETE');
    sendToPrinter(html);
}

export function printBoxLabel(boxName) {
    if (!boxName || boxName === 'all') return showToast('Selecione uma caixa.', 'error');
    const html = getStyledLabelHTML(`CAIXA: ${boxName}`, '', boxName, 'CAIXA');
    sendToPrinter(html);
}
