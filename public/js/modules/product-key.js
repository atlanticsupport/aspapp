function normalizeProductKeyPart(value) {
    return String(value ?? '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '');
}

const PLACEHOLDER_PARTS = new Set([
    'SEMPARTNUMBER',
    'SEMPARTNUMBERAUTO',
    'SEMREFERENCIA',
    'SEMREFERENCIAAUTO',
    'SEMREF',
    'SEMDESCRICAO',
    'SEMDESCRICAOAUTO',
    'SEMDESIGNACAO',
    'SEMDESIGNACAOAUTO',
    'SEMNOME',
    'SEMNOMEAUTO'
]);

function pickMeaningfulKeyPart(...values) {
    for (const value of values) {
        const normalized = normalizeProductKeyPart(value);
        if (normalized && !PLACEHOLDER_PARTS.has(normalized)) {
            return normalized;
        }
    }
    return '';
}

export function buildProductKey(product = {}) {
    const partNumber = pickMeaningfulKeyPart(product.part_number);
    const salesProcess = pickMeaningfulKeyPart(product.sales_process);
    const name = pickMeaningfulKeyPart(product.name);
    const brand = pickMeaningfulKeyPart(product.brand, product.maker);
    const category = pickMeaningfulKeyPart(product.category);
    const location = pickMeaningfulKeyPart(product.location);
    const box = pickMeaningfulKeyPart(product.box, product.box_number);
    const pallet = pickMeaningfulKeyPart(product.pallet);

    if (partNumber) {
        return `PN:${partNumber}|SP:${salesProcess || '-'}|BR:${brand || '-'}`;
    }

    return `NM:${name || '-'}|SP:${salesProcess || '-'}|BR:${brand || '-'}|CT:${category || '-'}|LC:${location || '-'}|BX:${box || '-'}|PL:${pallet || '-'}`;
}
