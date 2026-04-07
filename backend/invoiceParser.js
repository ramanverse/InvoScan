/**
 * InvoScan Invoice Parser - Extracts structured fields from raw OCR text
 * Enhanced with robust multi-pattern matching for real-world invoice photos
 */

const PATTERNS = {
    // Invoice number patterns (broadened for OCR noise)
    invoiceNumber: [
        /invoice\s*(?:#|no\.?|number|num\.?)[:\s]*([A-Z0-9][\w\-\/]{2,20})/i,
        /inv[\s.#:]*([A-Z]{1,4}[\-\/]?\d{3,10})/i,
        /bill\s*(?:#|no\.?)[:\s]*([A-Z0-9][\w\-\/]{2,20})/i,
        /(?:#|no\.?)\s*:?\s*([A-Z]{1,5}[\-]\d{3,10})/i,
        /([A-Z]{2,5}-\d{3,10})/,
    ],
    // Vendor/company name — much broader matching
    vendorName: [
        /(?:from|bill\s*from|billed\s*by|company)[:\s]+([A-Za-z0-9\s&.,'-]+?)(?:\n|$)/i,
        /^([A-Z][A-Za-z0-9\s&.,'-]{2,40}(?:Ltd\.?|Inc\.?|LLC|Corp\.?|Co\.?|Services|Solutions|Group|Industries|Agency|Enterprises|Technologies|Systems|Partners|Associates|Consulting|International))/m,
        /^([A-Z][A-Za-z]{2,}\s+[A-Za-z]{2,}(?:\s+[A-Za-z]+)?)\s*$/m,
    ],
    // Date patterns
    date: [
        /(?:invoice\s*date|date\s*of\s*issue|issued?|date)\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
        /(?:invoice\s*date|date)\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
        /(?:date)\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
        /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/,
        /([A-Za-z]+ \d{1,2},? \d{4})/,
    ],
    // Due date
    dueDate: [
        /(?:due\s*date|payment\s*due|pay\s*by)\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
        /(?:due\s*date|payment\s*due|pay\s*by)\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
        /due\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    ],
    // Total amount — expanded with more patterns  
    total: [
        /total\s*(?:due)?\s*:?\s*\$\s*([\d,]+\.?\d{0,2})/i,
        /(?:total\s*(?:amount\s*)?due|grand\s*total|amount\s*due)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
        /(?:balance\s*due|amount\s*payable)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
        /total\s*:?\s*(?:USD|EUR|GBP|INR)?\s*\$?\s*([\d,]+\.\d{2})/i,
        /\btotal\b[^$\d]{0,15}\$\s*([\d,]+\.\d{2})/i,
    ],
    // Subtotal
    subtotal: [
        /(?:subtotal|sub[\s-]*total)\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i,
        /(?:net\s*amount|net)\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i,
    ],
    // Tax
    tax: [
        /(?:tax|vat|gst|hst)\s*(?:\(?\d+\.?\d*%\)?)?\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
        /(?:sales\s*tax|service\s*tax)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
    ],
    // Currency
    currency: [
        /\b(USD|EUR|GBP|INR|CAD|AUD|JPY|CNY|CHF|SGD)\b/i,
        /(\$|€|£|₹|¥)/,
    ],
};

const CURRENCY_SYMBOLS = { '$': 'USD', '€': 'EUR', '£': 'GBP', '₹': 'INR', '¥': 'JPY' };

function parseAmount(str) {
    if (!str) return null;
    const cleaned = str.replace(/,/g, '').trim();
    const val = parseFloat(cleaned);
    return isNaN(val) ? null : val;
}

function extractField(text, patterns) {
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) return match[1].trim();
    }
    return null;
}

/**
 * Enhanced vendor extraction:
 * 1. Try regex patterns first
 * 2. If that fails, look for prominent text in the first few lines (company header)
 */
function extractVendor(text) {
    // Try standard patterns first
    const regexResult = extractField(text, PATTERNS.vendorName);
    if (regexResult && regexResult !== 'Unknown Vendor') return regexResult;

    // Fallback: grab the first substantial line that looks like a company name
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const line = lines[i];
        // Skip lines that are clearly not company names
        if (/^(invoice|bill\s*to|date|due|from|to|po\s*box|phone|fax|email|www\.|http|page|tax|sub)/i.test(line)) continue;
        if (/^\d+[\/\-\.]/.test(line)) continue; // Dates
        if (/^\$/.test(line)) continue; // Amounts
        // Check if it looks like a company name (mostly letters, reasonable length)
        if (/^[A-Z][A-Za-z0-9\s&.,'-]{4,50}$/.test(line) && line.split(' ').length <= 6) {
            return line;
        }
    }
    return null;
}

/**
 * Enhanced total extraction:
 * Find the largest dollar amount near the word "total" — or just the largest amount
 */
function extractTotal(text) {
    // Try regex patterns first
    const regexResult = extractField(text, PATTERNS.total);
    const regexAmount = parseAmount(regexResult);
    if (regexAmount && regexAmount > 0) return regexAmount;

    // Fallback: find all dollar amounts and pick the largest one (likely the total)
    const amounts = [];
    const amountPattern = /\$\s*([\d,]+\.\d{2})/g;
    let match;
    while ((match = amountPattern.exec(text)) !== null) {
        const val = parseAmount(match[1]);
        if (val && val > 0 && val < 10000000) amounts.push(val);
    }

    if (amounts.length > 0) {
        return Math.max(...amounts);
    }
    return 0;
}

function parseLineItems(text) {
    const items = [];
    // Pattern 1: "Description   Qty   UnitPrice   Amount" with flexible spacing
    const lineItemPattern = /^(.{3,50}?)\s{2,}(\d+(?:\.\d+)?)\s+\$?([\d,.]+)\s+\$?([\d,.]+)\s*$/gm;
    let match;
    while ((match = lineItemPattern.exec(text)) !== null) {
        const desc = match[1].trim();
        // Skip if the description looks like a header
        if (/^(item|description|qty|quantity|unit|price|amount|total)/i.test(desc)) continue;
        const amount = parseAmount(match[4]);
        if (amount && amount > 0 && amount < 1000000) {
            items.push({
                description: desc,
                quantity: parseFloat(match[2]) || 1,
                unit_price: parseAmount(match[3]) || amount,
                amount,
            });
        }
    }

    // Pattern 2: "Description   $Amount" (simpler invoices)
    if (items.length === 0) {
        const simplePattern = /^(.{5,50}?)\s{2,}\$?([\d,]+\.\d{2})\s*$/gm;
        while ((match = simplePattern.exec(text)) !== null) {
            const desc = match[1].trim();
            if (/^(subtotal|total|tax|vat|gst|amount|balance|payment|item|description|qty)/i.test(desc)) continue;
            const amount = parseAmount(match[2]);
            if (amount && amount > 0 && amount < 1000000) {
                items.push({
                    description: desc,
                    quantity: 1,
                    unit_price: amount,
                    amount,
                });
            }
        }
    }

    // Pattern 3: Lines with dollar amounts preceded by descriptive text
    if (items.length === 0) {
        const lines = text.split('\n');
        for (const line of lines) {
            const m = line.match(/^([A-Za-z][\w\s&\-()]{4,45}?)\s+(\d+)\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})/);
            if (m) {
                const desc = m[1].trim();
                if (/^(subtotal|total|tax|item|description)/i.test(desc)) continue;
                const amount = parseAmount(m[4]);
                if (amount && amount > 0) {
                    items.push({
                        description: desc,
                        quantity: parseFloat(m[2]) || 1,
                        unit_price: parseAmount(m[3]) || amount,
                        amount,
                    });
                }
            }
        }
    }

    return items;
}

function parseInvoice(rawText) {
    const text = rawText || '';

    const invoiceNumber = extractField(text, PATTERNS.invoiceNumber);
    const vendorName = extractVendor(text);
    const invoiceDate = extractField(text, PATTERNS.date);
    const dueDate = extractField(text, PATTERNS.dueDate);
    const subtotalStr = extractField(text, PATTERNS.subtotal);
    const taxStr = extractField(text, PATTERNS.tax);

    let currency = 'USD';
    const currencyMatch = extractField(text, PATTERNS.currency);
    if (currencyMatch) {
        currency = CURRENCY_SYMBOLS[currencyMatch] || currencyMatch.toUpperCase();
    }

    const total = extractTotal(text);
    const subtotal = parseAmount(subtotalStr);
    const tax = parseAmount(taxStr);

    const lineItems = parseLineItems(text);

    // Confidence scoring based on extracted fields
    const fields = [invoiceNumber, vendorName, invoiceDate, total > 0 ? total : null];
    const extractedCount = fields.filter(Boolean).length;
    const confidence = Math.round((extractedCount / fields.length) * 100);

    return {
        invoice_number: invoiceNumber || `INV-${Date.now()}`,
        vendor_name: vendorName || 'Unknown Vendor',
        invoice_date: invoiceDate || null,
        due_date: dueDate || null,
        subtotal: subtotal || (total && tax ? total - tax : null) || total || 0,
        tax: tax || 0,
        total_amount: total || subtotal || 0,
        currency,
        line_items: lineItems,
        confidence,
    };
}

module.exports = { parseInvoice };
