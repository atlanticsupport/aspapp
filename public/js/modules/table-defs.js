export const VIEW_COLUMNS = {
    logistics: [
        { id: 'part_number', label: 'PN / Ref', width: '15%' },
        { id: 'name', label: 'Descrição / Detalhes', width: '35%' },
        { id: 'maker', label: 'Maker', width: '10%' },
        { id: 'equipment', label: 'Equip.', width: '10%' },
        { id: 'quantity', label: 'Qtd', width: '8%', type: 'number' }
    ],
    transit: [
        { id: 'part_number', label: 'Referência', width: '12%' },
        { id: 'name', label: 'Designação', width: '25%' },
        { id: 'maker', label: 'Maker', width: '10%' },
        { id: 'quantity', label: 'Qtd', width: '8%', type: 'number' },
        { id: 'delivery_time', label: 'Del. Time', width: '15%' },
        { id: 'order_to', label: 'Order To / Processo', width: '15%' }
    ],
    stock_out: [
        { id: 'part_number', label: 'Referência', width: '12%' },
        { id: 'name', label: 'Designação', width: '25%' },
        { id: 'maker', label: 'Maker', width: '10%' },
        { id: 'cost_price', label: 'Custo', width: '10%', type: 'number' },
        { id: 'quantity', label: 'Qtd', width: '8%', type: 'number' },
        { id: 'order_to', label: 'Fornecedor', width: '15%' }
    ],
    inventory: [
        { id: 'sales_process', label: 'Processo', width: '15%' },
        { id: 'part_number', label: 'PN / Ref.', width: '18%' },
        { id: 'name', label: 'Descrição', width: '22%' },
        { id: 'location', label: 'Nave', width: '8%' },
        { id: 'category', label: 'Modelo', width: '12%' },
        { id: 'pallet', label: 'Palete / Caixa', width: '12%' },
        { id: 'cost_price', label: 'U.Price', width: '10%', type: 'number' },
        { id: 'quantity', label: 'Qtd', width: '5%', type: 'number' }
    ]
};
