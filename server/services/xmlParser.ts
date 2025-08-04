interface ExtractedInvoiceData {
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  totalAmount: string | null;
  taxAmount: string | null;
  subtotal: string | null;
  currency: string;
  taxId: string | null;
  companyName: string | null;
  concept: string | null;
  projectName: string | null;
  vendorAddress: string | null;
  buyerTaxId: string | null;
  buyerAddress: string | null;
  descriptionSummary: string | null;
  projectAddress: string | null;
  projectCity: string | null;
  notes: string | null;
  lineItems: Array<{
    description: string;
    quantity: string;
    unitPrice: string;
    totalPrice: string;
    itemType?: string;
  }>;
  confidenceScore: string;
}

function cleanAmount(value: string | null): string | null {
  if (!value) return null;

  // Remove any XML tags and whitespace
  const cleaned = value.replace(/<[^>]*>/g, '').trim();

  // Extract only numeric content with decimal point
  const numericMatch = cleaned.match(/[\d.,]+/);
  if (!numericMatch) return null;

  let numericValue = numericMatch[0];

  // Validate maximum value to prevent database overflow (10,2 precision = max 99,999,999.99)
  const MAX_DB_VALUE = 99999999.99;

  // Enhanced Colombian number format handling
  if (numericValue.includes(',') && numericValue.includes('.')) {
    const lastComma = numericValue.lastIndexOf(',');
    const lastPeriod = numericValue.lastIndexOf('.');

    if (lastComma > lastPeriod) {
      // Colombian format: 1.234.567,89 -> 1234567.89
      const parts = numericValue.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        numericValue = parts[0].replace(/\./g, '') + '.' + parts[1];
      }
    } else {
      // US format: 1,234,567.89 -> 1234567.89
      numericValue = numericValue.replace(/,/g, '');
    }
  } else if (numericValue.includes(',')) {
    // Only comma - check context to determine if decimal or thousands separator
    const parts = numericValue.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      // Likely decimal separator: 1234,89 -> 1234.89
      numericValue = parts[0] + '.' + parts[1];
    } else {
      // Thousands separator: 1,234,567 -> 1234567
      numericValue = numericValue.replace(/,/g, '');
    }
  } else if (numericValue.includes('.')) {
    // Only periods - check if it's a valid decimal or thousands separators
    const parts = numericValue.split('.');
    if (parts.length > 2) {
      // Multiple periods: thousands separator (1.234.567) -> 1234567
      numericValue = numericValue.replace(/\./g, '');
    } else if (parts.length === 2 && parts[1].length > 2) {
      // Special case: check if it looks like a valid decimal with extra zeros (11600.000000)
      const decimalPart = parts[1];
      if (/^0+$/.test(decimalPart)) {
        // All zeros after decimal: 11600.000000 -> 11600.00
        numericValue = parts[0] + '.00';
      } else {
        // Thousands separator: 1.234.567 -> 1234567
        numericValue = numericValue.replace(/\./g, '');
      }
    }
    // Otherwise keep as decimal: 1234.56
  }

  // Handle edge cases where extraction results in invalid strings
  if (numericValue === '.' || numericValue === '' || numericValue.length === 0) {
    return null;
  }

  const num = parseFloat(numericValue);
  if (isNaN(num) || num < 0) return null;

  // Cap at maximum database value to prevent overflow
  const cappedNum = Math.min(num, MAX_DB_VALUE);
  if (cappedNum !== num) {
    console.warn(`⚠️ Amount capped from ${num} to ${cappedNum} to prevent database overflow`);
  }

  return cappedNum.toFixed(2);
}

function extractTextFromXMLTag(xmlContent: string, tagName: string): string | null {
  const patterns = [
    new RegExp(`<${tagName}[^>]*>([^<]*)<\/${tagName}>`, 'gi'),
    new RegExp(`<cbc:${tagName}[^>]*>([^<]*)<\/cbc:${tagName}>`, 'gi'),
    new RegExp(`<cac:${tagName}[^>]*>([^<]*)<\/cac:${tagName}>`, 'gi'),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(xmlContent);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function extractWithRegexPatterns(content: string): Partial<ExtractedInvoiceData> {
  const text = content.toLowerCase();

  // Enhanced regex patterns for Colombian invoices with specific NITs
  const rfcPattern = /(rfc[:\s]*)([a-zñ&]{3,4}\d{6}[a-z\d]{3})/g;
  const nitPattern = /(nit[:\s#]*)(\d{8,12}-?\d?)/g; // Colombian NIT format
  const specificNitPattern = /(802014471-6|860527800-9)/g; // Your specific NITs
  const invoiceNumberPattern = /(n[oú]mero\s*de\s*factura[:\s#]*|factura\s*n[oú]mero[:\s#]*|invoice\s*number[:\s#]*|fe[:\s#]*|bodr\d*)([\w\-]+)/g;
  const datePattern = /(fecha\s*(de)?\s*(emisi[oó]n|factura)?[:\s]*)(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}|jun\s\d{2},\s\d{4}|jul\s\d{2},\s\d{4})/g;
  const dueDatePattern = /(fecha\s*de\s*vencimiento[:\s]*)(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}|jul\s\d{2},\s\d{4})/g;
  const totalPattern = /(total\s*(a\s*pagar)?[:\s\$cop]*)([\d,.]+)/g;
  const subtotalPattern = /(subtotal[:\s\$cop]*)([\d,.]+)/g;
  const taxPattern = /(iva|impuesto|tax\s*amount)[\s:\$cop]*([\d,.]+)/g;
  const currencyPattern = /(moneda[:\s]*|cop|usd)([a-z]*)/g;
  const conceptPattern = /(concepto|descripci[oó]n\s*de\s*servicios?|datos\s*adicionales)[:\s]*(.+)/g;
  const addressPattern = /(direcci[oó]n[:\s]*)(.+)/g;
  const buyerPattern = /(raz[oó]n\s*social|cliente|empresa\s*compradora|construcciones\s*obycon)[:\s]*(.+)/g;
  const vendorPattern = /(proveedor|empresa\s*emisora|invesark)[:\s]*(.+)/g;

  const data: Partial<ExtractedInvoiceData> = {};

  // Extract tax IDs (RFC or NIT)
  let match = rfcPattern.exec(text);
  if (match) {
    data.taxId = match[2].toUpperCase();
  } else {
    match = nitPattern.exec(text);
    if (match) {
      data.taxId = match[2];
    } else {
      match = specificNitPattern.exec(text);
      if (match) {
        data.taxId = match[1];  // Directly use the specific NIT found
      }
    }
  }

  // Extract invoice number
  match = invoiceNumberPattern.exec(text);
  if (match) {
    data.invoiceNumber = match[2];
  }

  // Extract dates
  match = datePattern.exec(text);
  if (match) {
    data.invoiceDate = match[4];
  }

  match = dueDatePattern.exec(text);
  if (match) {
    data.dueDate = match[2];
  }

  // Extract financial amounts
  match = totalPattern.exec(text);
  if (match) {
    data.totalAmount = match[3].replace(',', '');
  }

  match = subtotalPattern.exec(text);
  if (match) {
    data.subtotal = match[2].replace(',', '');
  }

  match = taxPattern.exec(text);
  if (match) {
    data.taxAmount = match[2].replace(',', '');
  }

  // Calculate subtotal if we have total and tax but no subtotal
  if (data.totalAmount && data.taxAmount && !data.subtotal) {
    const totalNum = parseFloat(data.totalAmount);
    const taxNum = parseFloat(data.taxAmount);
    if (!isNaN(totalNum) && !isNaN(taxNum) && totalNum > taxNum) {
      data.subtotal = (totalNum - taxNum).toFixed(2);
    }
  }

  // Extract currency
  match = currencyPattern.exec(text);
  if (match) {
    data.currency = match[2].toUpperCase();
  }

  // Extract concept/description
  match = conceptPattern.exec(text);
  if (match) {
    data.concept = match[2].trim();
  }

  // Extract addresses
  const addresses = [];
  let addressMatch;
  while ((addressMatch = addressPattern.exec(text)) !== null) {
    addresses.push(addressMatch[2].trim());
  }

  if (addresses.length > 0) {
    data.vendorAddress = addresses[0];
    if (addresses.length > 1) {
      data.buyerAddress = addresses[1];
    }
  }

  // Extract company names
  match = buyerPattern.exec(text);
  if (match) {
    data.companyName = match[2].trim();
  }

  match = vendorPattern.exec(text);
  if (match) {
    data.vendorName = match[2].trim();
  }

  return data;
}

function extractAmountFromXMLTag(xmlContent: string, tagName: string): { amount: string | null, currency: string } {
  console.log(`🔍 Searching for amount tag: ${tagName}`);

  // Enhanced patterns for better Colombian XML support
  const patterns = [
    // PRIMARY: Patterns for amounts within LegalMonetaryTotal context (with currency)
    new RegExp(`<cac:LegalMonetaryTotal[^>]*>.*?<cbc:${tagName}[^>]*currencyID="([^"]*)"[^>]*>([^<]*)<\/cbc:${tagName}>.*?<\/cac:LegalMonetaryTotal>`, 'gis'),

    // CRITICAL ADDITION: LegalMonetaryTotal without currencyID attribute
    new RegExp(`<cac:LegalMonetaryTotal[^>]*>.*?<cbc:${tagName}[^>]*>([^<]*)<\/cbc:${tagName}>.*?<\/cac:LegalMonetaryTotal>`, 'gis'),

    // Patterns for amounts within TaxTotal context (with currency)
    new RegExp(`<cac:TaxTotal[^>]*>.*?<cbc:${tagName}[^>]*currencyID="([^"]*)"[^>]*>([^<]*)<\/cbc:${tagName}>.*?<\/cac:TaxTotal>`, 'gis'),

    // TaxTotal without currencyID
    new RegExp(`<cac:TaxTotal[^>]*>.*?<cbc:${tagName}[^>]*>([^<]*)<\/cbc:${tagName}>.*?<\/cac:TaxTotal>`, 'gis'),

    // Standard patterns with currency
    new RegExp(`<cbc:${tagName}[^>]*currencyID="([^"]*)"[^>]*>([^<]*)<\/cbc:${tagName}>`, 'gi'),
    new RegExp(`<${tagName}[^>]*currencyID="([^"]*)"[^>]*>([^<]*)<\/${tagName}>`, 'gi'),

    // CRITICAL ADDITION: Standard patterns without currencyID
    new RegExp(`<cbc:${tagName}[^>]*>([^<]*)<\/cbc:${tagName}>`, 'gi'),
    new RegExp(`<${tagName}[^>]*>([^<]*)<\/${tagName}>`, 'gi'),
  ];

  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    // Reset regex state
    pattern.lastIndex = 0;
    const match = pattern.exec(xmlContent);

    if (match) {
      console.log(`✓ Found match for ${tagName} using pattern ${i + 1}:`, match);

      // Determine currency and amount based on capture groups
      let currency = 'COP';
      let amount = null;

      // Check if this is a pattern with currency (3 groups) or without (2 groups)
      if (match.length === 3 && match[2]) {
        // Pattern with currency: (currency, amount)
        currency = match[1] || 'COP';
        amount = match[2];
      } else if (match.length === 2 && match[1]) {
        // Pattern without currency: (amount)
        amount = match[1];
        currency = 'COP'; // Default to COP for Colombian invoices
      }

      if (amount && amount.trim()) {
        const cleanedAmount = cleanAmount(amount);
        if (cleanedAmount && !isNaN(parseFloat(cleanedAmount))) {
          console.log(`✅ ${tagName} extracted: ${cleanedAmount} ${currency}`);
          return { amount: cleanedAmount, currency };
        }
      }
    }
  }

  console.log(`❌ No valid amount found for ${tagName}`);
  return { amount: null, currency: 'COP' };
}

function validateColombianNIT(nit: string): string | null {
  if (!nit) return null;

  // Clean the NIT - remove spaces, dots, and keep only numbers and dash
  const cleanNIT = nit.toString().replace(/[.\s]/g, '').trim();

  // Colombian NIT format: 8-12 digits + check digit (format: ########-#)
  const nitPattern = /^(\d{8,12})-?(\d)$/;
  const match = cleanNIT.match(nitPattern);

  if (!match) {
    // Try without check digit and add dash
    const numericOnly = cleanNIT.replace(/[^\d]/g, '');
    if (numericOnly.length >= 8 && numericOnly.length <= 12) {
      return numericOnly + '-'; // Return without check digit, will be validated elsewhere
    }
    return null;
  }

  const [, baseNumber, checkDigit] = match;

  // Validate check digit using Colombian DV algorithm
  const weights = [41, 37, 29, 23, 19, 17, 13, 7, 3];
  let sum = 0;

  // Calculate from right to left
  const baseReversed = baseNumber.split('').reverse();
  for (let i = 0; i < baseReversed.length; i++) {
    const digit = parseInt(baseReversed[i]);
    const weight = weights[i % weights.length];
    sum += digit * weight;
  }

  const remainder = sum % 11;
  let calculatedCheckDigit;

  if (remainder === 0 || remainder === 1) {
    calculatedCheckDigit = remainder;
  } else {
    calculatedCheckDigit = 11 - remainder;
  }

  // Return formatted NIT if valid, otherwise return original for flexibility
  if (calculatedCheckDigit.toString() === checkDigit) {
    return `${baseNumber}-${checkDigit}`;
  }

  // Return with dash even if check digit doesn't match (some systems may have different validation)
  return `${baseNumber}-${checkDigit}`;
}

function extractPartyInfo(xmlContent: string, partyType: 'supplier' | 'customer'): {
  name: string | null;
  taxId: string | null;
  address: string | null;
} {
  const partyTag = partyType === 'supplier' ? 'AccountingSupplierParty' : 'AccountingCustomerParty';

  // Extract party section
  const partyPattern = new RegExp(`<cac:${partyTag}[^>]*>(.*?)<\/cac:${partyTag}>`, 'gis');
  const partyMatch = partyPattern.exec(xmlContent);

  if (!partyMatch) {
    return { name: null, taxId: null, address: null };
  }

  const partyContent = partyMatch[1];

  // Extract company name with multiple patterns
  const name = extractTextFromXMLTag(partyContent, 'RegistrationName') || 
               extractTextFromXMLTag(partyContent, 'Name') ||
               extractTextFromXMLTag(partyContent, 'CompanyName');

  // Extract tax ID with enhanced patterns for Colombian NITs
  let taxId = extractTextFromXMLTag(partyContent, 'CompanyID') ||
              extractTextFromXMLTag(partyContent, 'ID') ||
              extractTextFromXMLTag(partyContent, 'IdentificationCode') ||
              extractTextFromXMLTag(partyContent, 'TaxSchemeID');

  // Validate and format Colombian NIT
  if (taxId) {
    const validatedNIT = validateColombianNIT(taxId);
    if (validatedNIT) {
      taxId = validatedNIT;
    }
  }

  // Extract address components
  const streetName = extractTextFromXMLTag(partyContent, 'StreetName') || '';
  const cityName = extractTextFromXMLTag(partyContent, 'CityName') || '';
  const countrySubentity = extractTextFromXMLTag(partyContent, 'CountrySubentity') || '';
  const postalZone = extractTextFromXMLTag(partyContent, 'PostalZone') || '';

  const addressParts = [streetName, cityName, countrySubentity, postalZone].filter(Boolean);
  const address = addressParts.length > 0 ? addressParts.join(', ') : null;

  return { name, taxId, address };
}

function extractLineItems(xmlContent: string): Array<{
  description: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  itemType?: string;
}> {
  const lineItems: Array<{
    description: string;
    quantity: string;
    unitPrice: string;
    totalPrice: string;
    itemType?: string;
  }> = [];

  // Extract all invoice lines (for Invoice documents)
  const invoiceLinePattern = /<cac:InvoiceLine[^>]*>(.*?)<\/cac:InvoiceLine>/gi;
  let lineMatch;

  while ((lineMatch = invoiceLinePattern.exec(xmlContent)) !== null) {
    const lineContent = lineMatch[1];

    const description = extractTextFromXMLTag(lineContent, 'Description') || 
                       extractTextFromXMLTag(lineContent, 'Name') || '';

    const quantity = extractTextFromXMLTag(lineContent, 'InvoicedQuantity') || '1';

    const unitPriceResult = extractAmountFromXMLTag(lineContent, 'PriceAmount');
    const unitPrice = unitPriceResult.amount || '0.00';

    const totalPriceResult = extractAmountFromXMLTag(lineContent, 'LineExtensionAmount');
    const totalPrice = totalPriceResult.amount || '0.00';

    const itemType = extractTextFromXMLTag(lineContent, 'ClassificationCode');

    lineItems.push({
      description,
      quantity,
      unitPrice,
      totalPrice,
      itemType
    });
  }

  // Extract all credit note lines (for CreditNote documents) - using improved pattern matching
  const creditLineMatches = xmlContent.match(/<cac:CreditNoteLine[\s\S]*?<\/cac:CreditNoteLine>/g);

  if (creditLineMatches) {
    for (const creditLineMatch of creditLineMatches) {
      const lineContent = creditLineMatch;

      const description = extractTextFromXMLTag(lineContent, 'Description') || 
                         extractTextFromXMLTag(lineContent, 'Name') || '';

      const quantity = extractTextFromXMLTag(lineContent, 'CreditedQuantity') || '1';

      const unitPriceResult = extractAmountFromXMLTag(lineContent, 'PriceAmount');
      const unitPrice = unitPriceResult.amount || '0.00';

      const totalPriceResult = extractAmountFromXMLTag(lineContent, 'LineExtensionAmount');
      const totalPrice = totalPriceResult.amount || '0.00';

      const itemType = extractTextFromXMLTag(lineContent, 'ClassificationCode') || undefined;

      lineItems.push({
        description,
        quantity,
        unitPrice,
        totalPrice,
        itemType
      });
    }
  }

  return lineItems;
}

export function parseInvoiceXML(xmlContent: string, enableDebug: boolean = false): ExtractedInvoiceData {
  console.log('Starting enhanced XML parsing...');

  if (enableDebug) {
    console.log('DEBUG MODE: Detailed parsing information will be logged');
    console.log(`XML content length: ${xmlContent.length} characters`);
  }

  // Validate XML content
  if (!xmlContent || typeof xmlContent !== 'string' || xmlContent.trim().length === 0) {
    throw new Error('Invalid or empty XML content provided');
  }

  // Clean XML content of any potential JSON parsing issues
  const cleanedXmlContent = xmlContent.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  try {
    // Check if this is an AttachedDocument wrapper with embedded CDATA content
    const isAttachedDocument = cleanedXmlContent.includes('<AttachedDocument') || cleanedXmlContent.includes('<cac:AttachedDocument');
    const hasEmbeddedContent = cleanedXmlContent.includes('<cbc:Description><![CDATA[') && cleanedXmlContent.includes(']]></cbc:Description>');

    if (isAttachedDocument && hasEmbeddedContent) {
      // Enhanced detection: Look for Invoice or CreditNote root elements outside CDATA
      const hasTopLevelInvoice = /<(Invoice|CreditNote)[\s>]/.test(cleanedXmlContent.replace(/<!\[CDATA\[.*?\]\]>/g, ''));

      // If no Invoice/CreditNote found at top level (excluding CDATA), this is a pure wrapper
      if (!hasTopLevelInvoice) {
        console.log('Detected AttachedDocument wrapper with embedded CDATA content, extracting...');

        // Extract the CDATA content from Description tag
        const cdataPattern = /<cbc:Description><!\[CDATA\[(.*?)\]\]><\/cbc:Description>/;
        const cdataMatch = cleanedXmlContent.match(cdataPattern);

        if (cdataMatch && cdataMatch[1]) {
          const embeddedXml = cdataMatch[1].trim();

          if (enableDebug) {
            console.log('DEBUG: Found embedded XML content in CDATA section');
            console.log(`DEBUG: Embedded XML length: ${embeddedXml.length} characters`);
            console.log('DEBUG: Recursively parsing embedded content...');
          }

          // Recursively call parseInvoiceXML on the embedded content
          return parseInvoiceXML(embeddedXml, enableDebug);
        } else {
          console.log('Warning: AttachedDocument detected but no CDATA content found in Description tag');
        }
      } else {
        console.log('AttachedDocument detected but has top-level invoice data, proceeding with normal parsing');
      }
    }
    // Define scoring function first
    function scoreInvoiceNumber(number: string): number {
      let score = 0;

      // Prefer shorter numbers (more readable)
      if (number.length <= 15) score += 3;
      else if (number.length <= 25) score += 2;
      else if (number.length <= 35) score += 1;

      // Prefer numbers without UUIDs characteristics
      if (!number.includes('-') || number.split('-').length <= 2) score += 2;

      // Prefer numbers with digits
      if (/\d/.test(number)) score += 2;

      // Prefer numbers that look like invoice patterns
      if (/^(FE|INV|FACT|DOC)/i.test(number)) score += 3;
      if (/^\d+$/.test(number)) score += 2; // Pure numeric
      if (/^[A-Z]{1,3}\d+$/i.test(number)) score += 2; // Letter prefix + numbers

      return score;
    }

    // Extract supplier info
    const supplierInfo = extractPartyInfo(cleanedXmlContent, 'supplier');

    // Extract customer info
    const customerInfo = extractPartyInfo(cleanedXmlContent, 'customer');

    // Enhanced invoice number extraction with priority for readable formats
    let invoiceNumber = null;

    // Try common invoice number fields in order of preference (added ParentDocumentID for CreditNote)
    const invoiceNumberFields = [
      'InvoiceNumber', 'SerieNumber', 'SerialNumber', 'Number', 
      'InvoiceID', 'DocumentID', 'ParentDocumentID', 'ID'
    ];

    // Score and select the best invoice number
    let bestScore = 0;
    let bestNumber = null;

    for (const field of invoiceNumberFields) {
      const candidate = extractTextFromXMLTag(cleanedXmlContent, field);
      if (candidate) {
        const score = scoreInvoiceNumber(candidate);
        if (score > bestScore) {
          bestScore = score;
          bestNumber = candidate;
        }
      }
    }

    invoiceNumber = bestNumber;

    // If no good number found, try UUID as last resort but clean it
    if (!invoiceNumber || bestScore < 3) {
      const uuid = extractTextFromXMLTag(cleanedXmlContent, 'UUID');
      if (uuid) {
        // Try to extract meaningful parts from UUID or look for readable patterns
        const readablePatterns = [
          /(?:FE|INV|FACT|DOC)[-\s]*(\d+)/i,
          /(\d{4,})/,  // At least 4 consecutive digits
          /(^[A-Z0-9]{3,15})/i // Alphanumeric string 3-15 chars at start
        ];

        for (const pattern of readablePatterns) {
          const match = uuid.match(pattern);
          if (match) {
            invoiceNumber = match[0];
            break;
          }
        }

        // If still very long, take first meaningful part
        if (!invoiceNumber && uuid.length > 30) {
          invoiceNumber = uuid.substring(0, 20);
        } else if (!invoiceNumber) {
          invoiceNumber = uuid;
        }
      }
    }

    // Use regex patterns as fallback for better Spanish/Latin American support
    const regexData = extractWithRegexPatterns(cleanedXmlContent);

    // Extract dates
    const invoiceDate = extractTextFromXMLTag(cleanedXmlContent, 'IssueDate');
    const dueDate = extractTextFromXMLTag(cleanedXmlContent, 'DueDate');

    // Extract amounts with priority order and enhanced patterns
    let totalAmount = null;
    let taxAmount = null;
    let subtotal = null;
    let currency = 'COP';

    // Enhanced subtotal extraction (TaxExclusiveAmount) - THIS FIXES THE N/A ISSUE
    let amountResult = extractAmountFromXMLTag(cleanedXmlContent, 'TaxExclusiveAmount');
    if (amountResult.amount) {
      subtotal = amountResult.amount;
      currency = amountResult.currency;
    } else {
      // Fallback to LineExtensionAmount
      amountResult = extractAmountFromXMLTag(cleanedXmlContent, 'LineExtensionAmount');
      if (amountResult.amount) {
        subtotal = amountResult.amount;
        currency = amountResult.currency || currency;
      } else {
        // Try TaxableAmount as last resort
        amountResult = extractAmountFromXMLTag(cleanedXmlContent, 'TaxableAmount');
        if (amountResult.amount) {
          subtotal = amountResult.amount;
          currency = amountResult.currency || currency;
        }
      }
    }

    // Get total amount (TaxInclusiveAmount has priority)
    amountResult = extractAmountFromXMLTag(cleanedXmlContent, 'TaxInclusiveAmount');
    if (amountResult.amount) {
      totalAmount = amountResult.amount;
      currency = amountResult.currency || currency;
    } else {
      // Fallback to PayableAmount
      amountResult = extractAmountFromXMLTag(cleanedXmlContent, 'PayableAmount');
      if (amountResult.amount) {
        totalAmount = amountResult.amount;
        currency = amountResult.currency || currency;
      }
    }

    // Get tax amount
    amountResult = extractAmountFromXMLTag(cleanedXmlContent, 'TaxAmount');
    if (amountResult.amount) {
      taxAmount = amountResult.amount;
      currency = amountResult.currency || currency;
    }

    // Calculate subtotal if we have total and tax but no subtotal
    if (totalAmount && taxAmount && !subtotal) {
      const totalNum = parseFloat(totalAmount);
      const taxNum = parseFloat(taxAmount);
      if (!isNaN(totalNum) && !isNaN(taxNum) && totalNum > taxNum) {
        subtotal = (totalNum - taxNum).toFixed(2);
      }
    }

    // Extract additional fields
    const concept = extractTextFromXMLTag(cleanedXmlContent, 'Note') ||
                   extractTextFromXMLTag(cleanedXmlContent, 'Description');

    // Enhanced invoice number extraction with priority for readable formats
    let invoiceNumber = null;

    // Try common invoice number fields in order of preference (added ParentDocumentID for CreditNote)
    const invoiceNumberFields = [
      'InvoiceNumber', 'SerieNumber', 'SerialNumber', 'Number',
      'InvoiceID', 'DocumentID', 'ParentDocumentID', 'ID'
    ];

    // Score and select the best invoice number
    let bestScore = 0;
    let bestNumber = null;

    for (const field of invoiceNumberFields) {
      const candidate = extractTextFromXMLTag(cleanedXmlContent, field);
      if (candidate) {
        const score = scoreInvoiceNumber(candidate);
        if (score > bestScore) {
          bestScore = score;
          bestNumber = candidate;
        }
      }
    }

    invoiceNumber = bestNumber;

    // If no good number found, try UUID as last resort but clean it
    if (!invoiceNumber || bestScore < 3) {
      const uuid = extractTextFromXMLTag(cleanedXmlContent, 'UUID');
      if (uuid) {
        // Try to extract meaningful parts from UUID or look for readable patterns
        const readablePatterns = [
          /(?:FE|INV|FACT|DOC)[-\s]*(\d+)/i,
          /(\d{4,})/,  // At least 4 consecutive digits
          /(^[A-Z0-9]{3,15})/i // Alphanumeric string 3-15 chars at start
        ];

        for (const pattern of readablePatterns) {
          const match = uuid.match(pattern);
          if (match) {
            invoiceNumber = match[0];
            break;
          }
        }

        // If still very long, take first meaningful part
        if (!invoiceNumber && uuid.length > 30) {
          invoiceNumber = uuid.substring(0, 20);
        } else if (!invoiceNumber) {
          invoiceNumber = uuid;
        }
      }
    }

    // Use regex patterns as fallback for better Spanish/Latin American support
    const regexData = extractWithRegexPatterns(cleanedXmlContent);

    // Extract dates
    const invoiceDate = extractTextFromXMLTag(cleanedXmlContent, 'IssueDate');
    const dueDate = extractTextFromXMLTag(cleanedXmlContent, 'DueDate');

    // Extract amounts with priority order and enhanced patterns
    let totalAmount = null;
    let taxAmount = null;
    let subtotal = null;
    let currency = 'COP';

    // Enhanced subtotal extraction (TaxExclusiveAmount) - THIS FIXES THE N/A ISSUE
    amountResult = extractAmountFromXMLTag(cleanedXmlContent, 'TaxExclusiveAmount');
    if (amountResult.amount) {
      subtotal = amountResult.amount;
      currency = amountResult.currency;
    } else {
      // Fallback to LineExtensionAmount
      amountResult = extractAmountFromXMLTag(cleanedXmlContent, 'LineExtensionAmount');
      if (amountResult.amount) {
        subtotal = amountResult.amount;
        currency = amountResult.currency || currency;
      } else {
        // Try TaxableAmount as last resort
        amountResult = extractAmountFromXMLTag(cleanedXmlContent, 'TaxableAmount');
        if (amountResult.amount) {
          subtotal = amountResult.amount;
          currency = amountResult.currency || currency;
        }
      }
    }

    // Get total amount (TaxInclusiveAmount has priority)
    amountResult = extractAmountFromXMLTag(cleanedXmlContent, 'TaxInclusiveAmount');
    if (amountResult.amount) {
      totalAmount = amountResult.amount;
      currency = amountResult.currency || currency;
    } else {
      // Fallback to PayableAmount
      amountResult = extractAmountFromXMLTag(cleanedXmlContent, 'PayableAmount');
      if (amountResult.amount) {
        totalAmount = amountResult.amount;
        currency = amountResult.currency || currency;
      }
    }

    // Get tax amount
    amountResult = extractAmountFromXMLTag(cleanedXmlContent, 'TaxAmount');
    if (amountResult.amount) {
      taxAmount = amountResult.amount;
      currency = amountResult.currency || currency;
    }

    // Calculate subtotal if we have total and tax but no subtotal
    if (totalAmount && taxAmount && !subtotal) {
      const totalNum = parseFloat(totalAmount);
      const taxNum = parseFloat(taxAmount);
      if (!isNaN(totalNum) && !isNaN(taxNum) && totalNum > taxNum) {
        subtotal = (totalNum - taxNum).toFixed(2);
      }
    }

    // Extract additional fields
    const concept = extractTextFromXMLTag(cleanedXmlContent, 'Note') ||
                   extractTextFromXMLTag(cleanedXmlContent, 'Description');

    // Extract line items first
    const lineItems = extractLineItems(cleanedXmlContent);

    // Enhanced project name extraction with multiple sources
    let projectName = extractTextFromXMLTag(cleanedXmlContent, 'ProjectReference') ||
                     extractTextFromXMLTag(cleanedXmlContent, 'OrderReference') ||
                     extractTextFromXMLTag(cleanedXmlContent, 'ContractDocumentReference') ||
                     extractTextFromXMLTag(cleanedXmlContent, 'AdditionalDocumentReference');

    // If no direct project reference found, search in multiple content sources including line items
    if (!projectName) {
      const searchContent = [
        concept || '',
        extractTextFromXMLTag(cleanedXmlContent, 'Note') || '',
        extractTextFromXMLTag(cleanedXmlContent, 'Description') || '',
        extractTextFromXMLTag(cleanedXmlContent, 'StreetName') || '',
        // Add line item descriptions to search content
        ...lineItems.map(item => item.description)
      ].join(' ');

      const enhancedProjectPatterns = [
        // Colombian project patterns with more flexible matching
        /(?:PROYECTO|OBRA|PROJECT|CONTRATO):\s*([^\n\r,;\.]+)/i,
        /(?:PROYECTO|OBRA|PROJECT)\s+([A-ZÁÉÍÓÚÑ0-9\-\s]{3,40})/i,
        /CONTRATO\s+(?:NO\.?|NUM\.?|#)?\s*([A-Z0-9\-]{3,20})/i,
        /(?:CONSTRUCCIÓN|CONSTRUCTION)\s+(?:DE\s+)?([A-ZÁÉÍÓÚÑ0-9\-\s]{5,40})/i,
        /(?:EDIFICIO|BUILDING|TORRE|TOWER)\s+([A-ZÁÉÍÓÚÑ0-9\-\s]{3,30})/i,
        /(?:FASE|PHASE|ETAPA)\s+([A-ZÁÉÍÓÚÑ0-9\-\s]{2,25})/i,
        /(?:PARQUE|PARK)\s+([A-ZÁÉÍÓÚÑ0-9\-\s]{3,30})/i,
        /(?:CONJUNTO|COMPLEX|RESIDENCIAL)\s+([A-ZÁÉÍÓÚÑ0-9\-\s]{3,30})/i,
        /(?:URBANIZACIÓN|URBANIZACION|DEVELOPMENT)\s+([A-ZÁÉÍÓÚÑ0-9\-\s]{3,30})/i,
        // Pattern for "Parque Heredia" and similar compound names
        /(PARQUE\s+[A-ZÁÉÍÓÚÑ]+)/i,
        /(CONJUNTO\s+[A-ZÁÉÍÓÚÑ\s]+)/i,
        // General pattern for capturing proper nouns that might be project names
        /(?:EN\s+EL?\s+|PARA\s+EL?\s+|DEL?\s+)?([A-ZÁÉÍÓÚÑ]+\s+[A-ZÁÉÍÓÚÑ]+)(?:\s+(?:PHASE|FASE|ETAPA|TORRE|TOWER))?/i
      ];

      for (const pattern of enhancedProjectPatterns) {
        const match = searchContent.match(pattern);
        if (match && match[1]) {
          let candidateProject = match[1].trim();

          // Clean up common prefixes and suffixes
          candidateProject = candidateProject.replace(/^(DE\s+|THE\s+|EL\s+|LA\s+|EN\s+|PARA\s+)/i, '');
          candidateProject = candidateProject.replace(/(\s+EN\s+|\s+IN\s+|\s+AT\s+|\s+UBICADO).*$/i, '');
          candidateProject = candidateProject.replace(/(\s+PHASE|\s+FASE|\s+ETAPA).*$/i, '');

          // Validate that it's not too generic or short
          if (candidateProject.length >= 5 && 
              !candidateProject.match(/^(SERVICIOS?|TRABAJO|OBRA|PROJECT|CONSTRUCTION)$/i) &&
              candidateProject.match(/[A-ZÁÉÍÓÚÑ]/)) {
            projectName = candidateProject;
            break;
          }
        }
      }

      // If still no project name found, try to extract from address context
      if (!projectName) {
        const addressContext = [
          extractTextFromXMLTag(cleanedXmlContent, 'StreetName') || '',
          extractTextFromXMLTag(cleanedXmlContent, 'CityName') || '',
          projectAddress || ''
        ].join(' ');

        // Look for proper nouns in address that might indicate project
        const addressProjectPattern = /(PARQUE|CONJUNTO|RESIDENCIAL|URBANIZACIÓN|EDIFICIO)\s+([A-ZÁÉÍÓÚÑ\s]{3,25})/i;
        const addressMatch = addressContext.match(addressProjectPattern);
        if (addressMatch && addressMatch[0]) {
          projectName = addressMatch[0].trim();
        }
      }
    }

    // Extract delivery/project address information
    let projectAddress = null;
    let projectCity = null;

    // Look for delivery address that might be project location
    const deliveryPattern = /<cac:Delivery[^>]*>(.*?)<\/cac:Delivery>/gi;
    const deliveryMatch = deliveryPattern.exec(cleanedXmlContent);

    if (deliveryMatch) {
      const deliveryContent = deliveryMatch[1];
      const deliveryStreet = extractTextFromXMLTag(deliveryContent, 'StreetName');
      const deliveryCity = extractTextFromXMLTag(deliveryContent, 'CityName');
      const deliveryState = extractTextFromXMLTag(deliveryContent, 'CountrySubentity');

      if (deliveryStreet) {
        const addressParts = [deliveryStreet, deliveryCity, deliveryState].filter(Boolean);
        projectAddress = addressParts.join(', ');
        projectCity = deliveryCity;
      }
    }

    // Create description summary from line items
    const descriptionSummary = lineItems.length > 0 
      ? lineItems.map(item => item.description).join('; ').substring(0, 200)
      : null;

    // Validate extracted data to prevent JSON parsing issues
    const sanitizeField = (value: any): any => {
      if (typeof value === 'string') {
        // Remove any potential JSON-breaking characters
        return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
      }
      return value;
    };

    const result: ExtractedInvoiceData = {
      vendorName: sanitizeField(supplierInfo.name || regexData.vendorName),
      invoiceNumber: sanitizeField(invoiceNumber || regexData.invoiceNumber),
      invoiceDate: sanitizeField(invoiceDate || regexData.invoiceDate),
      dueDate: sanitizeField(dueDate || regexData.dueDate),
      totalAmount: sanitizeField(totalAmount || regexData.totalAmount),
      taxAmount: sanitizeField(taxAmount || regexData.taxAmount),
      subtotal: sanitizeField(subtotal || regexData.subtotal),
      currency: sanitizeField(currency || regexData.currency || 'COP'),
      taxId: sanitizeField(supplierInfo.taxId || regexData.taxId),
      companyName: sanitizeField(customerInfo.name || regexData.companyName),
      concept: sanitizeField(concept || regexData.concept),
      projectName: sanitizeField(projectName),
      vendorAddress: sanitizeField(supplierInfo.address || regexData.vendorAddress),
      buyerTaxId: sanitizeField(customerInfo.taxId),
      buyerAddress: sanitizeField(customerInfo.address || regexData.buyerAddress),
      descriptionSummary: sanitizeField(descriptionSummary),
      projectAddress: sanitizeField(projectAddress),
      projectCity: sanitizeField(projectCity),
      notes: sanitizeField(concept || regexData.concept),
      lineItems: lineItems.map(item => ({
        description: sanitizeField(item.description),
        quantity: sanitizeField(item.quantity),
        unitPrice: sanitizeField(item.unitPrice),
        totalPrice: sanitizeField(item.totalPrice),
        itemType: sanitizeField(item.itemType)
      })),
      confidenceScore: '0.95' // High confidence for XML parsing
    };

    if (enableDebug) {
      console.log('DEBUG: Detailed extraction results:', {
        vendorName: result.vendorName,
        invoiceNumber: result.invoiceNumber,
        invoiceDate: result.invoiceDate,
        totalAmount: result.totalAmount,
        taxAmount: result.taxAmount,
        subtotal: result.subtotal,
        currency: result.currency,
        projectName: result.projectName,
        lineItemsCount: result.lineItems.length,
        supplierTaxId: result.taxId,
        customerTaxId: result.buyerTaxId,
        vendorAddress: result.vendorAddress ? 'Found' : 'Not found',
        buyerAddress: result.buyerAddress ? 'Found' : 'Not found',
        projectAddress: result.projectAddress ? 'Found' : 'Not found'
      });
    }

    console.log('XML parsing completed successfully:', {
      vendorName: result.vendorName,
      invoiceNumber: result.invoiceNumber,
      totalAmount: result.totalAmount,
      currency: result.currency,
      lineItemsCount: result.lineItems.length,
      projectName: result.projectName ? `Found: "${result.projectName}"` : 'Not found',
      subtotal: result.subtotal ? 'Found' : 'Not found'
    });

    // Enhanced debugging for project extraction
    if (enableDebug || !result.projectName) {
      console.log('🔍 PROJECT EXTRACTION DEBUG:', {
        concept: concept ? `"${concept.substring(0, 100)}..."` : 'Not found',
        notes: extractTextFromXMLTag(cleanedXmlContent, 'Note') ? 'Found' : 'Not found',
        lineItemDescriptions: lineItems.slice(0, 3).map(item => `"${item.description.substring(0, 50)}..."`),
        deliveryAddress: projectAddress ? `"${projectAddress}"` : 'Not found',
        searchableContent: [concept, extractTextFromXMLTag(cleanedXmlContent, 'Note')].filter(Boolean).join(' | ').substring(0, 200)
      });
    }

    return result;

  } catch (error) {
    console.error('XML parsing failed:', error);
    throw new Error(`XML parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}