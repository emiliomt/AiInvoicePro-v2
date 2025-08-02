// Enhanced Colombian Invoice Extraction Rules
// server/services/colombianInvoiceExtractor.ts

interface ColombianInvoiceRules {
  detectColombianInvoice(ocrText: string): boolean;
  getColombianExtractionPrompt(ocrText: string, learningImprovements: string): string;
  validateColombianData(extractedData: any): any;
}

class ColombianInvoiceExtractor implements ColombianInvoiceRules {

  /**
   * Detect if this is a Colombian invoice based on specific patterns
   */
  detectColombianInvoice(ocrText: string): boolean {
    const colombianIndicators = [
      /\bNIT\s*\d{8,10}-?\d\b/i,                    // Colombian NIT format
      /\bCOP\b/i,                                   // Colombian Peso
      /Factura\s*Electr[óo]nica/i,                 // Electronic invoice
      /\bDIAN\b/i,                                  // Colombian tax authority
      /\bCUFE\b/i,                                  // Colombian electronic invoice code
      /Bogot[aá]|Medell[ií]n|Cali|Barranquilla|Cartagena/i, // Colombian cities
      /\bColombia\b/i,                              // Country name
      /Fecha\s*Vencimiento/i,                       // Colombian due date format
      /\bIVA\b/i,                                   // Colombian VAT term
      /Responsables?\s*de\s*IVA/i                   // Colombian tax responsibility
    ];

    return colombianIndicators.some(pattern => pattern.test(ocrText));
  }

  /**
   * Generate Colombian-specific extraction prompt
   */
  getColombianExtractionPrompt(ocrText: string, learningImprovements: string): string {
    return `🇨🇴 COLOMBIAN ELECTRONIC INVOICE EXPERT EXTRACTION SYSTEM 🇨🇴

You are specialized in Colombian DIAN electronic invoices (UBL 2.1 format). Apply these MANDATORY Colombian-specific rules:

${learningImprovements}

🔥 COLOMBIAN INVOICE DETECTION CONFIRMED - APPLY THESE RULES:

📋 COLOMBIAN FIELD EXTRACTION PRIORITIES:

1. **VENDOR INFORMATION (EMISOR/PROVEEDOR)**:
   - vendorName: Look for complete company name after "EMISOR:", "PROVEEDOR:", or at document header
   - taxId: Colombian NIT format XXXXXXXX-X (ALWAYS include check digit): "900478552-0"
   - vendorAddress: Often NOT specified in service invoices - return null if absent

2. **BUYER INFORMATION (CLIENTE/ADQUIRIENTE)**:
   - companyName: Look after "CLIENTE:", "ADQUIRIENTE:", "CONSTRUCC[IÓ]ONES"
   - buyerTaxId: Colombian NIT format XXXXXXXX-X (ALWAYS include check digit): "860527800-9"
   - buyerAddress: Business address near buyer company name

3. **COLOMBIAN DATE FORMATS** 🗓️:
   - invoiceDate: "FECHA FACTURA:" DD/MM/YYYY → convert to YYYY-MM-DD
   - dueDate: "FECHA VENCIMIENTO:" DD/MM/YYYY → convert to YYYY-MM-DD
   - CRITICAL: Convert "09/07/2025" to "2025-07-09" (July 9th, 2025)

4. **COLOMBIAN MONETARY VALUES** 💰:
   - Use PERIODS as thousand separators: "107.100" = 107,100 COP
   - totalAmount: Look for "TOTAL OPERACIÓN", "TOTAL A PAGAR", "TOTAL FACTURA"
   - taxAmount: Look for "IVA" followed by amount
   - subtotal: Base amount before IVA (often labeled as service amount)
   - currency: Always "COP" for Colombian pesos

5. **PROJECT INFORMATION** 🏗️:
   - projectName: Look for "PROYECTO:", "POR CONCEPTO DE:", project descriptions
   - projectAddress: Look for delivery addresses, "Dirección:" in project context
   - projectCity: Extract city from project delivery address (e.g., "Cartagena")
   - If project city not explicit, extract from any address mentioning cities

6. **COLOMBIAN NIT VALIDATION** 🆔:
   - ALWAYS extract complete NIT including check digit
   - Pattern: 8-10 digits + dash + 1 check digit
   - Examples: "900478552-0", "860527800-9"
   - NEVER truncate the check digit

7. **ADDRESS HIERARCHY** 📍:
   - Vendor Address: Business address (often missing in service invoices)
   - Buyer Address: Client's business address (near company name)
   - Project Address: Delivery/work site address (different from business addresses)

8. **COLOMBIAN INVOICE NUMBERS** 📄:
   - invoiceNumber: Look for "Factura Electrónica No", "ASOM", "FE", numerical sequences

9. **SERVICE INVOICE PATTERNS** 🔧:
   - Colombian service companies often don't show vendor addresses
   - Focus on project delivery locations
   - "CONSTRUCCIONES" indicates construction buyer company

🎯 MANDATORY EXTRACTION GUIDELINES FOR COLOMBIA:

OCR TEXT TO ANALYZE:
${ocrText.substring(0, 4000)} ${ocrText.length > 4000 ? '...[truncated]' : ''}

🇨🇴 RETURN VALID JSON WITH COLOMBIAN FORMATTING:

{
  "vendorName": "Complete vendor name with business description",
  "taxId": "XXXXXXXX-X (with check digit)",
  "vendorAddress": null,
  "companyName": "Buyer company name",
  "buyerTaxId": "XXXXXXXX-X (with check digit)", 
  "buyerAddress": "Complete buyer business address",
  "invoiceNumber": "Invoice number",
  "invoiceDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD",
  "totalAmount": "Amount as decimal string",
  "taxAmount": "Tax amount as decimal string",
  "subtotal": "Subtotal as decimal string",
  "currency": "COP",
  "projectName": "Project name or description",
  "projectAddress": "Project delivery address",
  "projectCity": "Project city",
  "concept": "Service description",
  "notes": "Additional notes",
  "confidenceScore": "0.95"
}

⚠️ CRITICAL COLOMBIAN RULES:
- ALWAYS include NIT check digits (-0, -9, etc.)
- Convert Colombian dates DD/MM/YYYY to YYYY-MM-DD
- Handle period thousand separators in amounts
- Return null for vendor address if not specified
- Extract project city from delivery context
- Recognize "FECHA VENCIMIENTO" as due date

RESPOND WITH VALID JSON ONLY - NO EXPLANATIONS`;
  }

  /**
   * Validate and correct Colombian-specific data patterns
   */
  validateColombianData(extractedData: any): any {
    const correctedData = { ...extractedData };

    // Fix Colombian NIT format - ensure check digit is included
    if (correctedData.taxId && !correctedData.taxId.includes('-')) {
      const nitPattern = /^(\d{8,10})$/;
      if (nitPattern.test(correctedData.taxId)) {
        console.log(`Warning: Colombian NIT missing check digit: ${correctedData.taxId}`);
      }
    }

    if (correctedData.buyerTaxId && !correctedData.buyerTaxId.includes('-')) {
      const nitPattern = /^(\d{8,10})$/;
      if (nitPattern.test(correctedData.buyerTaxId)) {
        console.log(`Warning: Colombian buyer NIT missing check digit: ${correctedData.buyerTaxId}`);
      }
    }

    // Validate Colombian date formats
    if (correctedData.invoiceDate) {
      correctedData.invoiceDate = this.validateColombianDate(correctedData.invoiceDate);
    }

    if (correctedData.dueDate) {
      correctedData.dueDate = this.validateColombianDate(correctedData.dueDate);
    }

    // Ensure currency is COP for Colombian invoices
    if (!correctedData.currency || correctedData.currency === 'USD') {
      correctedData.currency = 'COP';
    }

    // Fix Colombian number format (periods as thousand separators)
    if (correctedData.totalAmount) {
      correctedData.totalAmount = this.parseColombianAmount(correctedData.totalAmount);
    }

    if (correctedData.taxAmount) {
      correctedData.taxAmount = this.parseColombianAmount(correctedData.taxAmount);
    }

    if (correctedData.subtotal) {
      correctedData.subtotal = this.parseColombianAmount(correctedData.subtotal);
    }

    return correctedData;
  }

  /**
   * Convert Colombian date formats to ISO format
   */
  private validateColombianDate(dateStr: string): string {
    if (!dateStr) return dateStr;

    // Handle DD/MM/YYYY format common in Colombia
    const ddmmyyyyPattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = ddmmyyyyPattern.exec(dateStr);

    if (match) {
      const [, day, month, year] = match;
      return `${year}-${month}-${day}`;
    }

    // Already in ISO format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }

    return dateStr;
  }

  /**
   * Parse Colombian amount format (periods as thousand separators)
   */
  private parseColombianAmount(amountStr: string): string {
    if (!amountStr) return amountStr;

    let cleaned = String(amountStr).replace(/[^\d.,]/g, '');

    // Colombian format: 107.100 = 107,100 (periods are thousand separators)
    if (cleaned.includes('.') && !cleaned.includes(',')) {
      const parts = cleaned.split('.');
      if (parts.length === 2 && parts[1].length === 3) {
        // This is likely Colombian format: 107.100 = 107100
        cleaned = parts[0] + parts[1];
      } else if (parts.length === 2 && parts[1].length <= 2) {
        // This is decimal: 107.10 = 107.10
        // Keep as is
      } else if (parts.length > 2) {
        // Multiple periods: 1.107.100 = 1107100
        cleaned = parts.join('');
      }
    }

    const num = parseFloat(cleaned);
    return !isNaN(num) && num >= 0 ? num.toFixed(2) : amountStr;
  }
}

// Enhanced project name patterns to better capture project names from different parts of the invoice
const enhancedProjectPatterns = [
            /(?:PROYECTO|OBRA|PROJECT|CONTRATO):\s*([^\n\r,;\.]+)/i,
            /(?:PROYECTO|OBRA|PROJECT)\s+([A-ZÁÉÍÓÚÑ0-9\-\s]{3,40})/i,
            /CONTRATO\s+(?:NO\.?|NUM\.?|#)?\s*([A-ZÁÉÍÓÚÑ0-9\-]{3,25})/i,
            /(?:CONSTRUCCIÓN|CONSTRUCTION)\s+(?:DE\s+)?([A-ZÁÉÍÓÚÑ0-9\-\s]{5,40})/i,
            /(?:EDIFICIO|BUILDING|TORRE|TOWER)\s+([A-ZÁÉÍÓÚÑ0-9\-\s]{3,30})/i,
            /(?:FASE|PHASE|ETAPA)\s+([A-ZÁÉÍÓÚÑ0-9\-\s]{2,25})/i,
            /(?:PARQUE|PARK)\s+([A-ZÁÉÍÓÚÑ0-9\-\s]{3,30})/i,
            /(?:CONJUNTO|COMPLEX|RESIDENCIAL)\s+([A-ZÁÉÍÓÚÑ0-9\-\s]{3,30})/i,
            /(?:URBANIZACIÓN|URBANIZACION|DEVELOPMENT)\s+([A-ZÁÉÍÓÚÑ0-9\-\s]{3,30})/i,
            // Specific pattern for compound project names like "Parque Heredia"
            /(PARQUE\s+[A-ZÁÉÍÓÚÑ]+)/i,
            /(CONJUNTO\s+[A-ZÁÉÍÓÚÑ\s]+)/i,
            // General pattern for proper nouns that could be project names
            /(?:EN\s+EL?\s+|PARA\s+EL?\s+|DEL?\s+)?([A-ZÁÉÍÓÚÑ]+\s+[A-ZÁÉÍÓÚÑ]+)(?:\s+(?:PHASE|FASE|ETAPA|TORRE|TOWER|APARTAMENTOS?))?/i
          ];

// Integration function
export function applyColombianRules(ocrText: string, learningImprovements: string = ""): {
  isColombianInvoice: boolean;
  extractionPrompt?: string;
  validator?: (data: any) => any;
} {
  const extractor = new ColombianInvoiceExtractor();
  const isColombianInvoice = extractor.detectColombianInvoice(ocrText);

  if (isColombianInvoice) {
    console.log('🇨🇴 Colombian invoice detected - applying specialized extraction rules');

    return {
      isColombianInvoice: true,
      extractionPrompt: extractor.getColombianExtractionPrompt(ocrText, learningImprovements),
      validator: (data: any) => extractor.validateColombianData(data)
    };
  }

  return { isColombianInvoice: false };
}

// Enhanced learning insights specifically for Colombian invoices
export const COLOMBIAN_LEARNING_INSIGHTS = [
  {
    field: 'taxId',
    errorType: 'missing_check_digit',
    suggestedFix: 'Always include Colombian NIT check digit: XXXXXXXX-X format',
    frequency: 10,
    lastSeen: new Date()
  },
  {
    field: 'dueDate',
    errorType: 'date_format',
    suggestedFix: 'Convert Colombian dates DD/MM/YYYY to YYYY-MM-DD format',
    frequency: 8,
    lastSeen: new Date()
  },
  {
    field: 'totalAmount',
    errorType: 'number_format',
    suggestedFix: 'Colombian amounts use periods as thousand separators: 107.100 = 107,100',
    frequency: 7,
    lastSeen: new Date()
  },
  {
    field: 'projectCity',
    errorType: 'extraction_missing',
    suggestedFix: 'Extract city from project delivery address context, not vendor address',
    frequency: 6,
    lastSeen: new Date()
  },
  {
    field: 'vendorAddress',
    errorType: 'false_positive',
    suggestedFix: 'Colombian service invoices often do not specify vendor address - return null',
    frequency: 5,
    lastSeen: new Date()
  }
];

// Cache invalidation function
export function clearColombianInvoiceCache(ocrText: string): void {
  // This will be imported into aiService.ts where extractionCache is defined
  console.log('🇨🇴 Cache clearing requested for Colombian invoice');
}

export default ColombianInvoiceExtractor;