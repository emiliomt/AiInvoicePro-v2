
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
    // Only periods - could be thousands separators in European format
    const parts = numericValue.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length > 2)) {
      // Thousands separator: 1.234.567 -> 1234567
      numericValue = numericValue.replace(/\./g, '');
    }
    // Otherwise keep as decimal: 1234.56
  }
  
  const num = parseFloat(numericValue);
  return !isNaN(num) && num >= 0 ? num.toFixed(2) : null;
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
  
  // Enhanced regex patterns for Spanish/Latin American invoices
  const rfcPattern = /(rfc[:\s]*)([a-zñ&]{3,4}\d{6}[a-z\d]{3})/g;
  const nitPattern = /(nit[:\s#]*)(\d{5,15}-?\d?)/g;
  const invoiceNumberPattern = /(n[oú]mero\s*de\s*factura[:\s#]*|factura\s*n[oú]mero[:\s#]*|invoice\s*number[:\s#]*|fe[:\s#]*)([\w\-]+)/g;
  const datePattern = /(fecha\s*(de)?\s*(emisi[oó]n|factura)?[:\s]*)(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/g;
  const dueDatePattern = /(fecha\s*de\s*vencimiento[:\s]*)(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/g;
  const totalPattern = /(total\s*(a\s*pagar)?[:\s\$]*)([\d,]+\.\d{2})/g;
  const subtotalPattern = /(subtotal[:\s\$]*)([\d,]+\.\d{2})/g;
  const taxPattern = /(iva|impuesto)[\s:\$]*([\d,]+\.\d{2})/g;
  const currencyPattern = /(moneda[:\s]*)([a-z]+)/g;
  const conceptPattern = /(concepto|descripci[oó]n\s*de\s*servicios?)[:\s]*(.+)/g;
  const addressPattern = /(direcci[oó]n[:\s]*)(.+)/g;
  const buyerPattern = /(raz[oó]n\s*social|cliente|empresa\s*compradora)[:\s]*(.+)/g;
  const vendorPattern = /(proveedor|empresa\s*emisora)[:\s]*(.+)/g;
  
  const data: Partial<ExtractedInvoiceData> = {};
  
  // Extract tax IDs (RFC or NIT)
  let match = rfcPattern.exec(text);
  if (match) {
    data.taxId = match[2].toUpperCase();
  } else {
    match = nitPattern.exec(text);
    if (match) {
      data.taxId = match[2];
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
  const patterns = [
    new RegExp(`<${tagName}[^>]*currencyID="([^"]*)"[^>]*>([^<]*)<\/${tagName}>`, 'gi'),
    new RegExp(`<cbc:${tagName}[^>]*currencyID="([^"]*)"[^>]*>([^<]*)<\/cbc:${tagName}>`, 'gi'),
  ];
  
  for (const pattern of patterns) {
    const match = pattern.exec(xmlContent);
    if (match && match[2]) {
      return {
        amount: cleanAmount(match[2]),
        currency: match[1] || 'COP'
      };
    }
  }
  
  return { amount: null, currency: 'COP' };
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
  
  // Extract company name
  const name = extractTextFromXMLTag(partyContent, 'RegistrationName') || 
               extractTextFromXMLTag(partyContent, 'Name');
  
  // Extract tax ID
  const taxId = extractTextFromXMLTag(partyContent, 'CompanyID') ||
                extractTextFromXMLTag(partyContent, 'ID');
  
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
  
  // Extract all invoice lines
  const linePattern = /<cac:InvoiceLine[^>]*>(.*?)<\/cac:InvoiceLine>/gi;
  let lineMatch;
  
  while ((lineMatch = linePattern.exec(xmlContent)) !== null) {
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
  
  return lineItems;
}

export function parseInvoiceXML(xmlContent: string, enableDebug: boolean = false): ExtractedInvoiceData {
  console.log('Starting enhanced XML parsing...');
  
  if (enableDebug) {
    console.log('DEBUG MODE: Detailed parsing information will be logged');
    console.log(`XML content length: ${xmlContent.length} characters`);
  }
  
  try {
    // Extract supplier info
    const supplierInfo = extractPartyInfo(xmlContent, 'supplier');
    
    // Extract customer info
    const customerInfo = extractPartyInfo(xmlContent, 'customer');
    
    // Enhanced invoice number extraction with priority for readable formats
    let invoiceNumber = null;
    
    // Try common invoice number fields in order of preference
    const invoiceNumberFields = [
      'InvoiceNumber', 'SerieNumber', 'SerialNumber', 'Number', 
      'InvoiceID', 'DocumentID', 'ID'
    ];
    
    // Score and select the best invoice number
    let bestScore = 0;
    let bestNumber = null;
    
    for (const field of invoiceNumberFields) {
      const candidate = extractTextFromXMLTag(xmlContent, field);
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
      const uuid = extractTextFromXMLTag(xmlContent, 'UUID');
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
    
    // Use regex patterns as fallback for better Spanish/Latin American support
    const regexData = extractWithRegexPatterns(xmlContent);
    
    // Extract dates
    const invoiceDate = extractTextFromXMLTag(xmlContent, 'IssueDate');
    const dueDate = extractTextFromXMLTag(xmlContent, 'DueDate');
    
    // Extract amounts with priority order
    let totalAmount = null;
    let taxAmount = null;
    let subtotal = null;
    let currency = 'COP';
    
    // Try to get total amount (TaxInclusiveAmount has priority)
    let amountResult = extractAmountFromXMLTag(xmlContent, 'TaxInclusiveAmount');
    if (amountResult.amount) {
      totalAmount = amountResult.amount;
      currency = amountResult.currency;
    } else {
      // Fallback to PayableAmount
      amountResult = extractAmountFromXMLTag(xmlContent, 'PayableAmount');
      if (amountResult.amount) {
        totalAmount = amountResult.amount;
        currency = amountResult.currency;
      }
    }
    
    // Get tax amount
    amountResult = extractAmountFromXMLTag(xmlContent, 'TaxAmount');
    if (amountResult.amount) {
      taxAmount = amountResult.amount;
      currency = amountResult.currency || currency;
    }
    
    // Get subtotal - try standard XML patterns in order
    amountResult = extractAmountFromXMLTag(xmlContent, 'TaxExclusiveAmount');
    if (amountResult.amount) {
      subtotal = amountResult.amount;
      currency = amountResult.currency || currency;
    } else {
      // Fallback to LineExtensionAmount
      amountResult = extractAmountFromXMLTag(xmlContent, 'LineExtensionAmount');
      if (amountResult.amount) {
        subtotal = amountResult.amount;
        currency = amountResult.currency || currency;
      } else {
        // Try TaxableAmount as last resort
        amountResult = extractAmountFromXMLTag(xmlContent, 'TaxableAmount');
        if (amountResult.amount) {
          subtotal = amountResult.amount;
          currency = amountResult.currency || currency;
        }
      }
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
    const concept = extractTextFromXMLTag(xmlContent, 'Note') ||
                   extractTextFromXMLTag(xmlContent, 'Description');
    
    // Enhanced project name extraction with multiple sources
    let projectName = extractTextFromXMLTag(xmlContent, 'ProjectReference') ||
                     extractTextFromXMLTag(xmlContent, 'OrderReference') ||
                     extractTextFromXMLTag(xmlContent, 'ContractDocumentReference') ||
                     extractTextFromXMLTag(xmlContent, 'AdditionalDocumentReference');
    
    // If no direct project reference found, search in multiple content sources
    if (!projectName) {
      const searchContent = [
        concept || '',
        extractTextFromXMLTag(xmlContent, 'Note') || '',
        extractTextFromXMLTag(xmlContent, 'Description') || '',
        // Also search in delivery location which might indicate project site
        extractTextFromXMLTag(xmlContent, 'StreetName') || ''
      ].join(' ');
      
      const enhancedProjectPatterns = [
        /(?:PROYECTO|OBRA|PROJECT|CONTRATO):\s*([^\n\r,;]+)/i,
        /(?:PROYECTO|OBRA|PROJECT)\s+([A-Z0-9\-\s]{3,30})/i,
        /CONTRATO\s+(?:NO\.?|NUM\.?|#)?\s*([A-Z0-9\-]{3,20})/i,
        /(?:CONSTRUCCIÓN|CONSTRUCTION)\s+(?:DE\s+)?([A-Z0-9\-\s]{5,40})/i,
        /(?:EDIFICIO|BUILDING|TORRE|TOWER)\s+([A-Z0-9\-\s]{3,25})/i,
        /(?:FASE|PHASE|ETAPA)\s+([A-Z0-9\-\s]{2,20})/i
      ];
      
      for (const pattern of enhancedProjectPatterns) {
        const match = searchContent.match(pattern);
        if (match && match[1]) {
          projectName = match[1].trim();
          // Remove common suffixes/prefixes that aren't part of project name
          projectName = projectName.replace(/^(DE\s+|THE\s+|EL\s+|LA\s+)/i, '');
          projectName = projectName.replace(/(\s+EN\s+|\s+IN\s+|\s+AT\s+).*$/i, '');
          break;
        }
      }
    }
    
    // Extract delivery/project address information
    let projectAddress = null;
    let projectCity = null;
    
    // Look for delivery address that might be project location
    const deliveryPattern = /<cac:Delivery[^>]*>(.*?)<\/cac:Delivery>/gi;
    const deliveryMatch = deliveryPattern.exec(xmlContent);
    
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
    
    // Extract line items
    const lineItems = extractLineItems(xmlContent);
    
    // Create description summary from line items
    const descriptionSummary = lineItems.length > 0 
      ? lineItems.map(item => item.description).join('; ').substring(0, 200)
      : null;
    
    const result: ExtractedInvoiceData = {
      vendorName: supplierInfo.name || regexData.vendorName,
      invoiceNumber: invoiceNumber || regexData.invoiceNumber,
      invoiceDate: invoiceDate || regexData.invoiceDate,
      dueDate: dueDate || regexData.dueDate,
      totalAmount: totalAmount || regexData.totalAmount,
      taxAmount: taxAmount || regexData.taxAmount,
      subtotal: subtotal || regexData.subtotal,
      currency: currency || regexData.currency || 'COP',
      taxId: supplierInfo.taxId || regexData.taxId,
      companyName: customerInfo.name || regexData.companyName,
      concept: concept || regexData.concept,
      projectName,
      vendorAddress: supplierInfo.address || regexData.vendorAddress,
      buyerTaxId: customerInfo.taxId,
      buyerAddress: customerInfo.address || regexData.buyerAddress,
      descriptionSummary,
      projectAddress,
      projectCity,
      notes: concept || regexData.concept,
      lineItems,
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
      projectName: result.projectName ? 'Found' : 'Not found'
    });
    
    return result;
    
  } catch (error) {
    console.error('XML parsing failed:', error);
    throw new Error(`XML parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
