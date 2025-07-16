
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
  
  // Handle Colombian number format: 1.234.567,89 -> 1234567.89
  if (numericValue.includes(',') && numericValue.includes('.')) {
    const lastComma = numericValue.lastIndexOf(',');
    const lastPeriod = numericValue.lastIndexOf('.');
    
    if (lastComma > lastPeriod) {
      // Colombian format: 1.234.567,89
      const parts = numericValue.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        numericValue = parts[0].replace(/\./g, '') + '.' + parts[1];
      }
    } else {
      // US format: 1,234,567.89
      numericValue = numericValue.replace(/,/g, '');
    }
  } else if (numericValue.includes(',')) {
    // Only comma - could be decimal or thousands separator
    const parts = numericValue.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      // Decimal separator: 1234,89
      numericValue = parts[0] + '.' + parts[1];
    } else {
      // Thousands separator: 1,234,567
      numericValue = numericValue.replace(/,/g, '');
    }
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
  const linePattern = /<cac:InvoiceLine[^>]*>(.*?)<\/cac:InvoiceLine>/gis;
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

export function parseInvoiceXML(xmlContent: string): ExtractedInvoiceData {
  console.log('Starting direct XML parsing...');
  
  try {
    // Extract supplier info
    const supplierInfo = extractPartyInfo(xmlContent, 'supplier');
    
    // Extract customer info
    const customerInfo = extractPartyInfo(xmlContent, 'customer');
    
    // Extract invoice number
    const invoiceNumber = extractTextFromXMLTag(xmlContent, 'ID') ||
                         extractTextFromXMLTag(xmlContent, 'UUID');
    
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
    
    // Get subtotal
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
        // Try TaxableAmount from TaxSubtotal
        amountResult = extractAmountFromXMLTag(xmlContent, 'TaxableAmount');
        if (amountResult.amount) {
          subtotal = amountResult.amount;
          currency = amountResult.currency || currency;
        }
      }
    }
    
    // Calculate missing amounts if possible
    if (totalAmount && taxAmount && !subtotal) {
      const totalNum = parseFloat(totalAmount);
      const taxNum = parseFloat(taxAmount);
      if (!isNaN(totalNum) && !isNaN(taxNum)) {
        subtotal = (totalNum - taxNum).toFixed(2);
      }
    }
    
    // Extract additional fields
    const concept = extractTextFromXMLTag(xmlContent, 'Note') ||
                   extractTextFromXMLTag(xmlContent, 'Description');
    
    // Enhanced project name extraction
    let projectName = extractTextFromXMLTag(xmlContent, 'ProjectReference') ||
                     extractTextFromXMLTag(xmlContent, 'OrderReference') ||
                     extractTextFromXMLTag(xmlContent, 'ContractDocumentReference');
    
    // If no project reference found, search in notes and descriptions for project patterns
    if (!projectName) {
      const noteContent = concept || '';
      const projectPatterns = [
        /(?:PROYECTO|OBRA|PROJECT|CONTRATO):\s*([^\n\r,]+)/i,
        /(?:PROYECTO|OBRA|PROJECT)\s+([A-Z0-9\-\s]+)/i,
        /CONTRATO\s+NO\.?\s*([A-Z0-9\-]+)/i
      ];
      
      for (const pattern of projectPatterns) {
        const match = noteContent.match(pattern);
        if (match && match[1]) {
          projectName = match[1].trim();
          break;
        }
      }
    }
    
    // Extract delivery/project address information
    let projectAddress = null;
    let projectCity = null;
    
    // Look for delivery address that might be project location
    const deliveryPattern = /<cac:Delivery[^>]*>(.*?)<\/cac:Delivery>/gis;
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
      vendorName: supplierInfo.name,
      invoiceNumber,
      invoiceDate,
      dueDate,
      totalAmount,
      taxAmount,
      subtotal,
      currency,
      taxId: supplierInfo.taxId,
      companyName: customerInfo.name,
      concept,
      projectName,
      vendorAddress: supplierInfo.address,
      buyerTaxId: customerInfo.taxId,
      buyerAddress: customerInfo.address,
      descriptionSummary,
      projectAddress,
      projectCity,
      notes: concept,
      lineItems,
      confidenceScore: '0.95' // High confidence for XML parsing
    };
    
    console.log('XML parsing completed successfully:', {
      vendorName: result.vendorName,
      invoiceNumber: result.invoiceNumber,
      totalAmount: result.totalAmount,
      currency: result.currency,
      lineItemsCount: result.lineItems.length
    });
    
    return result;
    
  } catch (error) {
    console.error('XML parsing failed:', error);
    throw new Error(`XML parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
