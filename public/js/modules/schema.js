
export const COLUMN_DEFINITIONS = [
    { id: 'part_number', label: 'Part-Number', type: 'text', width: '160px', required: true, showInImport: true },
    { id: 'name', label: 'Descrição (Description)', type: 'text', width: '300px', required: true, showInImport: true },
    { id: 'quantity', label: 'Qtd / Qt', type: 'number', width: '70px', align: 'center', required: true, showInImport: true },
    { id: 'cost_price', label: 'Preço Un. (U.Price) €', type: 'number', step: '0.01', width: '100px', align: 'center', showInImport: true },
    { id: 'delivery_time', label: 'Del. Time', type: 'text', width: '100px', showInImport: true },

    // Optional Fields for Import (Context Enrichment)
    { id: 'maker', label: 'Fornecedor', type: 'text', width: '120px', showInImport: true },
    { id: 'ship_plant', label: 'Ship/P.Plant', type: 'text', width: '100px', showInImport: true },
    { id: 'equipment', label: 'Equipment', type: 'text', width: '100px', showInImport: true },
    { id: 'order_to', label: 'Order To', type: 'text', width: '150px', showInImport: true },
    { id: 'order_date', label: 'Date', type: 'date', width: '100px', showInImport: true },

    { id: 'category', label: 'Type (Modelo)', type: 'text', width: '120px', showInImport: true },
    { id: 'location', label: 'Localização', type: 'text', width: '120px', showInImport: true },
    { id: 'box', label: 'Caixa', type: 'text', width: '80px', showInImport: true },
    { id: 'pallet', label: 'Palete', type: 'text', width: '80px', showInImport: true },
    { id: 'brand', label: 'Marca (Origem)', type: 'text', width: '120px', showInImport: true },

    // Hidden / Calculated
    { id: 'min_quantity', label: 'Min Qtd', type: 'number', width: '60px', align: 'center', showInImport: false },
    { id: 'local_price', label: 'Preço Total €', type: 'number', step: '0.01', width: '90px', align: 'center', showInImport: false },
    { id: 'sales_process', label: 'Process (PO)', type: 'text', width: '120px', showInImport: false },
    { id: 'status', label: 'Status', type: 'text', width: '80px', showInImport: false }
];
