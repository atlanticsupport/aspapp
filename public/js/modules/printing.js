// Helper to get stylized label HTML
function getStyledLabelHTML(title, subtitle, barcodeValue, type = 'item') {
    const settings = JSON.parse(localStorage.getItem('labelSettings')) || { width: 5, height: 3 };
    const w = parseFloat(settings.width) || 15;
    const h = parseFloat(settings.height) || 10;
    
    // Adaptive sizing logic directly in JS (safe for 0x0 hidden iframe printing viewports)
    const titleSize = type === 'item' ? (w < 8 ? '10pt' : '16pt') : (w < 8 ? '12pt' : '20pt');
    const footerSize = w < 8 ? '8pt' : '11pt';
    const logoHeight = h < 6 ? '6mm' : '12mm';
    const padding = w < 8 ? '1.5mm' : '3mm';

    return `
        <!DOCTYPE html>
        <html>
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;800&display=swap" rel="stylesheet">
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
                        color: #000;
                        padding: ${padding};
                    }
                    .label-wrapper {
                        width: 100%;
                        height: 100%;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: space-between;
                        background: #fff;
                    }
                    .header-section {
                        width: 100%;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        margin-bottom: 2mm;
                    }
                    .logo-header {
                        width: 100%;
                        display: flex;
                        justify-content: center;
                        margin-bottom: 1.5mm;
                    }
                    .logo-header img {
                        height: ${logoHeight};
                        max-width: 80%;
                        object-fit: contain;
                        filter: grayscale(100%) contrast(1.2);
                    }
                    .main-title {
                        font-size: ${titleSize};
                        font-weight: 800;
                        text-align: center;
                        line-height: 1.25;
                        width: 100%;
                        color: #000;
                        overflow: hidden;
                        display: -webkit-box;
                        -webkit-line-clamp: 2; /* Garante que títulos gigantes não invadem o barcode */
                        -webkit-box-orient: vertical;
                    }
                    .barcode-area {
                        flex: 1; /* Domina todo o espaço vertical livre */
                        width: 100%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 0; /* Vital para o flex shrink impedir colapsos */
                        padding: 1.5mm 0;
                    }
                    .barcode-svg {
                        width: 100%;
                        height: 100%;
                        max-width: 95%; /* Impede que toque fisicamente nas margens da impressão */
                        object-fit: contain; /* Estica responsivamente e preserva o Aspect Ratio */
                    }
                    .footer-info {
                        width: 100%;
                        font-size: ${footerSize};
                        font-weight: 600;
                        text-align: center;
                        color: #444;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        border-top: 0.1mm dashed #ccc;
                        padding-top: 1mm;
                    }
                </style>
            </head>
            <body>
                <div class="label-wrapper">
                    <div class="header-section">
                        <div class="logo-header">
                            <img src="logo.svg" onerror="this.style.display='none'">
                        </div>
                        <div class="main-title">${title}</div>
                    </div>
                    
                    <div class="barcode-area">
                        <svg class="barcode-svg" id="barcode"></svg>
                    </div>

                    ${subtitle ? `<div class="footer-info">${subtitle}</div>` : ''}

                    <script>
                        JsBarcode("#barcode", "${barcodeValue}", {
                            format: "CODE128",
                            height: 140, /* Resolução Interna Esticada do Barcode */
                            width: 3.5,  /* Barras internas generosamente visíveis */
                            displayValue: true,
                            fontSize: 22,
                            font: "Inter",
                            fontOptions: "bold",
                            textMargin: 6,
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
