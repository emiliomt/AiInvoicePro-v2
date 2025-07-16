import OpenAI from "openai";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || ""
});

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

// Helper functions for data validation
function validateString(value: any): string | null {
  if (!value || typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function validateAmount(value: any): string | null {
  if (!value) return null;

  // For XML processing, be more lenient with amount formatting
  let cleaned = String(value).trim();

  // Remove XML tags if present
  cleaned = cleaned.replace(/<[^>]*>/g, '');

  // Remove any whitespace and non-numeric characters except decimal separators
  cleaned = cleaned.replace(/\s+/g, '');
  cleaned = cleaned.replace(/[^\d.,-]/g, '');

  // Skip if no digits found
  if (!/\d/.test(cleaned)) return null;

  // Handle different decimal separators and thousand separators
  // Colombian format: 1.234.567,89 or international: 1,234,567.89
  if (cleaned.includes(',') && cleaned.includes('.')) {
    const lastComma = cleaned.lastIndexOf(',');
    const lastPeriod = cleaned.lastIndexOf('.');

    if (lastComma > lastPeriod) {
      // Format: 1.234.567,89 (European/Colombian)
      const parts = cleaned.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        cleaned = parts[0].replace(/\./g, '') + '.' + parts[1];
      }
    } else {
      // Format: 1,234,567.89 (US)
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    // Only comma present
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      // Decimal separator: 1234,89
      cleaned = parts[0] + '.' + parts[1];
    } else {
      // Thousands separator: 1,234,567
      cleaned = cleaned.replace(/,/g, '');
    }
  }

  // Final cleanup - ensure only one decimal point
  const decimalParts = cleaned.split('.');
  if (decimalParts.length > 2) {
    // Multiple decimals - keep the last one as decimal separator
    const lastDecimal = decimalParts.pop();
    cleaned = decimalParts.join('') + '.' + lastDecimal;
  }

  const num = parseFloat(cleaned);
  return !isNaN(num) && num >= 0 ? num.toFixed(2) : null;
}

function validateDate(value: any): string | null {
  if (!value) return null;
  try {
    const date = new Date(value);
    return !isNaN(date.getTime()) ? date.toISOString().split('T')[0] : null;
  } catch {
    return null;
  }
}

function validateTaxId(value: any): string | null {
  if (!value) return null;
  const cleaned = String(value).replace(/[^\d-]/g, '');
  return cleaned.length >= 5 ? cleaned : null;
}

// Simplified extraction for difficult documents
async function attemptSimplifiedExtraction(ocrText: string): Promise<ExtractedInvoiceData> {
  const simplePrompt = `Extract only the most obvious fields from this invoice text:
${ocrText.substring(0, 2000)}

Return JSON with these fields only (use null if not found):
{
  "vendorName": "first company name found",
  "totalAmount": "largest monetary amount",
  "invoiceNumber": "invoice/factura number",
  "invoiceDate": "date in YYYY-MM-DD format",
  "currency": "COP/USD/MXN"
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Extract only the most obvious invoice fields. Return valid JSON." },
      { role: "user", content: simplePrompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.0,
    max_tokens: 500
  });

  const simpleData = JSON.parse(response.choices[0].message.content || '{}');

  return {
    vendorName: simpleData.vendorName || null,
    invoiceNumber: simpleData.invoiceNumber || null,
    invoiceDate: simpleData.invoiceDate || null,
    dueDate: null,
    totalAmount: simpleData.totalAmount || null,
    taxAmount: null,
    subtotal: null,
    currency: simpleData.currency || "COP",
    taxId: null,
    companyName: null,
    concept: null,
    projectName: null,
    vendorAddress: null,
    buyerTaxId: null,
    buyerAddress: null,
    descriptionSummary: null,
    projectAddress: null,
    projectCity: null,
    notes: null,
    lineItems: [],
    confidenceScore: "0.5"
  };
}

// Simple cache for repeated extractions
const extractionCache = new Map<string, ExtractedInvoiceData>();

// Direct XML parsing function for amount extraction
async function extractAmountsDirectlyFromXML(xmlContent: string): Promise<{
  totalAmount: string | null;
  taxAmount: string | null;
  subtotal: string | null;
  currency: string;
}> {
  try {
    // Use regex to find amount fields with currency attributes
    const amountPatterns = [
      /<cbc:TaxInclusiveAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:TaxInclusiveAmount>/gi,
      /<cbc:PayableAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:PayableAmount>/gi,
      /<cbc:TaxExclusiveAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:TaxExclusiveAmount>/gi,
      /<cbc:TaxAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:TaxAmount>/gi,
      /<cbc:LineExtensionAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:LineExtensionAmount>/gi,
    ];

    let totalAmount = null;
    let taxAmount = null;
    let subtotal = null;
    let currency = "COP";

    // Search for TaxInclusiveAmount or PayableAmount as total
    let match;
    const taxInclusivePattern = /<cbc:TaxInclusiveAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:TaxInclusiveAmount>/gi;
    while ((match = taxInclusivePattern.exec(xmlContent)) !== null) {
      currency = match[1];
      totalAmount = validateAmount(match[2]);
      if (totalAmount) break;
    }

    // If no TaxInclusiveAmount, try PayableAmount
    if (!totalAmount) {
      const payablePattern = /<cbc:PayableAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:PayableAmount>/gi;
      while ((match = payablePattern.exec(xmlContent)) !== null) {
        currency = match[1];
        totalAmount = validateAmount(match[2]);
        if (totalAmount) break;
      }
    }

    // Search for TaxAmount
    const taxPattern = /<cbc:TaxAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:TaxAmount>/gi;
    while ((match = taxPattern.exec(xmlContent)) !== null) {
      currency = match[1];
      taxAmount = validateAmount(match[2]);
      if (taxAmount) break;
    }

    // Search for TaxExclusiveAmount as subtotal
    const subtotalPattern = /<cbc:TaxExclusiveAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:TaxExclusiveAmount>/gi;
    while ((match = subtotalPattern.exec(xmlContent)) !== null) {
      currency = match[1];
      subtotal = validateAmount(match[2]);
      if (subtotal) break;
    }

    // If no subtotal found, try LineExtensionAmount
    if (!subtotal) {
      const lineExtensionPattern = /<cbc:LineExtensionAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:LineExtensionAmount>/gi;
      while ((match = lineExtensionPattern.exec(xmlContent)) !== null) {
        currency = match[1];
        subtotal = validateAmount(match[2]);
        if (subtotal) break;
      }
    }

    // If we have total and tax but no subtotal, calculate it
    if (totalAmount && taxAmount && !subtotal) {
      const totalNum = parseFloat(totalAmount);
      const taxNum = parseFloat(taxAmount);
      if (!isNaN(totalNum) && !isNaN(taxNum)) {
        subtotal = (totalNum - taxNum).toFixed(2);
      }
    }

    console.log('Direct XML extraction results:', { totalAmount, taxAmount, subtotal, currency });
    return { totalAmount, taxAmount, subtotal, currency };
  } catch (error) {
    console.error('Direct XML parsing failed:', error);
    return { totalAmount: null, taxAmount: null, subtotal: null, currency: "COP" };
  }
}

export async function extractInvoiceData(ocrText: string, applyLearning: boolean = true): Promise<ExtractedInvoiceData> {
  try {
    console.log(`Starting AI extraction with ${ocrText.length} characters of OCR text`);

    if (!ocrText || ocrText.trim().length < 10) {
      throw new Error('Insufficient OCR text for AI extraction');
    }

    // Check cache first for performance
    const cacheKey = ocrText.substring(0, 500); // Use first 500 chars as cache key
    if (extractionCache.has(cacheKey)) {
      console.log('Using cached extraction result');
      return extractionCache.get(cacheKey)!;
    }

    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY_ENV_VAR) {
      console.error('OpenAI API key not found in environment variables');
      throw new Error('AI service configuration error - API key missing');
    }

    // Apply learning improvements if enabled
    let learningImprovements = "";
    if (applyLearning) {
      const { storage } = await import('../storage');
      const insights = await storage.getLearningInsights();

      if (insights.length > 0) {
        learningImprovements = `\n\n🎯 LEARNING IMPROVEMENTS (Based on Previous Errors):
${insights.map(insight => `- ${insight.field}: ${insight.suggestedFix} (seen ${insight.frequency} times)`).join('\n')}
\nPay special attention to these fields and avoid these common mistakes.

🔧 FIELD-SPECIFIC IMPROVEMENTS:
- For vendorName: Look for company name immediately after "Emisor:" or "Proveedor:"
- For totalAmount: Find the largest monetary amount, usually after "Total:" or "Total a Pagar:"
- For taxId: Look for NIT/RFC patterns - numbers with dashes (e.g., 12-3456789-1)
- For invoiceDate: Find date near invoice number, convert to YYYY-MM-DD format
- For projectName: CRITICAL - Look for these patterns: "PROYECTO:", "OBRA:", "Project:", "CONTRACT:", "CONTRATO:", project codes, construction site names, building names, or any reference to specific work locations
- For projectAddress: Look for delivery addresses, work site addresses, or addresses mentioned in project context that differ from company addresses
- For projectCity: Extract city from project/delivery context, or look for city names mentioned with project information`;
      }
    }

    // Detect if this is XML content
    const isXML = ocrText.trim().startsWith('<?xml') || ocrText.includes('<Invoice') || ocrText.includes('<Factura') || ocrText.includes('<cbc:') || ocrText.includes('<cac:');
    console.log(`Processing ${isXML ? 'XML' : 'OCR'} content for extraction`);

    let extractedData: any = {};

    // Check if this is XML content and use specialized parsing
    const isXMLContent = ocrText.trim().startsWith('<?xml') || ocrText.includes('<Invoice') || ocrText.includes('<cac:') || ocrText.includes('<cbc:');

    let xmlContent = null;
    if (isXMLContent) {
      xmlContent = ocrText;
      console.log('XML content detected, will use direct parsing for amounts');

      // Try using the dedicated XML parser first
      try {
        const { parseInvoiceXML } = await import('./xmlParser');
        const xmlParsedData = parseInvoiceXML(xmlContent);

        if (xmlParsedData.totalAmount || xmlParsedData.taxAmount || xmlParsedData.subtotal) {
          console.log('XML parser extracted amounts:', {
            totalAmount: xmlParsedData.totalAmount,
            taxAmount: xmlParsedData.taxAmount,
            subtotal: xmlParsedData.subtotal,
            currency: xmlParsedData.currency
          });

          // Use XML parser results as base and merge with AI results
          extractedData = {
            ...extractedData,
            ...xmlParsedData
          };
        }
      } catch (xmlParseError) {
        console.error('XML parser failed, falling back to AI extraction:', xmlParseError);
      }
    }

    const prompt = isXML ? 
      `You are an expert XML invoice parser specialized in Latin American electronic invoices (UBL 2.1, DIAN Colombia format). Extract ALL possible structured data from this XML document:

${learningImprovements}

🔍 COMPREHENSIVE XML EXTRACTION RULES WITH PRIORITY ON AMOUNTS:
1. AMOUNTS (HIGHEST PRIORITY): Search exhaustively for ALL monetary values in these patterns:
   - <cbc:TaxInclusiveAmount currencyID="COP">VALUE</cbc:TaxInclusiveAmount>
   - <cbc:PayableAmount currencyID="COP">VALUE</cbc:PayableAmount>
   - <cbc:TaxExclusiveAmount currencyID="COP">VALUE</cbc:TaxExclusiveAmount>
   - <cbc:TaxAmount currencyID="COP">VALUE</cbc:TaxAmount>
   - <cbc:LineExtensionAmount currencyID="COP">VALUE</cbc:LineExtensionAmount>
   - <cbc:Amount currencyID="COP">VALUE</cbc:Amount>
   - <cbc:TaxableAmount currencyID="COP">VALUE</cbc:TaxableAmount>
   - <cbc:BaseAmount currencyID="COP">VALUE</cbc:BaseAmount>
   - ANY tag containing "Amount" with numeric content and currencyID

2. VENDOR/SUPPLIER INFO: Look for <cac:AccountingSupplierParty>, <cac:SenderParty>, <cac:PartyTaxScheme>
3. CUSTOMER/BUYER INFO: Look for <cac:AccountingCustomerParty>, <cac:ReceiverParty>
4. TAX IDs: Find <cbc:CompanyID>, <cbc:IdentificationCode> - extract complete values including dashes
5. DATES: Find <cbc:IssueDate>, <cbc:DueDate>, <cbc:Date> tags, convert to YYYY-MM-DD
6. ADDRESSES: Extract from <cbc:StreetName>, <cbc:CityName>, <cbc:PostalZone>, <cbc:CountrySubentity>
7. INVOICE DETAILS: Look for <cbc:ID>, <cbc:UUID>, <cbc:Description>, <cbc:Note>
8. LINE ITEMS: Extract from <cac:InvoiceLine>, <cac:Item>, <cbc:InvoicedQuantity>, <cbc:Price>
9. PROJECT INFORMATION: Look for project references in notes, descriptions, delivery addresses, and contract references

FULL XML CONTENT TO ANALYZE:
${ocrText.substring(0, 15000)} ${ocrText.length > 15000 ? '...[truncated for length]' : ''}

🎯 ENHANCED FIELD MAPPING (FOCUS ON AMOUNTS AND PROJECT EXTRACTION):
- totalAmount: PRIORITY ORDER: <cbc:TaxInclusiveAmount> > <cbc:PayableAmount> > <cbc:TaxExclusiveAmount> > any <cbc:*Amount> with highest value
- taxAmount: PRIORITY ORDER: <cbc:TaxAmount> > <cbc:TaxableAmount> > sum of all tax subtotals
- subtotal: PRIORITY ORDER: <cbc:TaxExclusiveAmount> > <cbc:LineExtensionAmount> > <cbc:BaseAmount> > totalAmount minus taxAmount
- currency: EXTRACT from currencyID attribute (COP, USD, EUR, etc.) - look in ALL amount fields
- vendorName: <cbc:RegistrationName> in <cac:AccountingSupplierParty> OR <cac:Party> within supplier context
- taxId: <cbc:CompanyID> in supplier's <cac:PartyTaxScheme> or <cac:PartyIdentification>
- vendorAddress: Complete address from supplier's <cac:PostalAddress>: <cbc:StreetName>, <cbc:CityName>, <cbc:CountrySubentity>
- companyName: <cbc:RegistrationName> in <cac:AccountingCustomerParty> OR buyer party
- buyerTaxId: <cbc:CompanyID> in customer's <cac:PartyTaxScheme>
- buyerAddress: Complete address from customer's <cac:PostalAddress>
- invoiceNumber: <cbc:ID> at document root level OR <cbc:UUID>
- invoiceDate: <cbc:IssueDate> at document level
- dueDate: <cbc:DueDate> if available
- concept: <cbc:Note> OR <cbc:Description> at document level
- notes: Any additional <cbc:Note> or <cbc:AdditionalInformation>
- projectName: EXTRACT project names using these methods in order: 1) Search for text patterns like "Proyecto:", "Obra:", "Proyecto No:", "Project:", followed by project name, 2) Look in <cbc:Note> fields for project references, 3) Check <cac:ProjectReference><cbc:ID>, 4) Look in <cac:OrderReference> or <cac:ContractDocumentReference> tags, 5) Search line item descriptions for project mentions
- projectAddress: EXTRACT from <cac:DeliveryAddress> OR look for address patterns in notes/descriptions that differ from vendor/buyer addresses
- projectCity: <cbc:CityName> from <cac:DeliveryAddress> OR extract city from project address if different from vendor/buyer cities
- descriptionSummary: Concatenate item descriptions from <cac:InvoiceLine>

CRITICAL AMOUNT EXTRACTION LOGIC:
1. EXHAUSTIVE SEARCH: Scan the ENTIRE XML for ANY tag containing "Amount" - don't miss any monetary values
2. CURRENCY DETECTION: Extract currencyID="XXX" from amount tags - this is crucial for proper display
3. NUMERIC VALIDATION: Extract only the numeric content from amount tags, preserve decimals
4. FALLBACK STRATEGY: If standard UBL tags not found, look for similar patterns or Spanish equivalents
5. MULTIPLE AMOUNTS: If multiple amounts found, prioritize the largest for totalAmount
6. TAX CALCULATION: Try to calculate missing amounts (subtotal = total - tax) if some amounts missing
7. PROJECT NAME EXTRACTION: Look for "Proyecto" text pattern in XML content and extract the phrase/text immediately following it

ADVANCED PARSING INSTRUCTIONS FOR AMOUNTS:
- Search case-insensitively for amount patterns
- Handle both English and Spanish XML namespaces
- Extract decimal amounts with proper precision (2 decimal places)
- Look for amounts in nested structures like <cac:TaxTotal><cac:TaxSubtotal><cbc:TaxAmount>
- Check for amounts in line items and aggregate if needed
- Preserve currency information from currencyID attributes

Return complete JSON with ALL extracted fields (extract amounts even if other fields fail):

{
  "vendorName": "extracted supplier company name",
  "invoiceNumber": "document ID or UUID",
  "invoiceDate": "YYYY-MM-DD format",
  "dueDate": "YYYY-MM-DD or null",
  "totalAmount": "final amount as decimal string",
  "taxAmount": "tax total as decimal string",
  "subtotal": "pre-tax amount as decimal string",
  "currency": "currency code from XML",
  "taxId": "supplier tax ID",
  "companyName": "customer company name",
  "concept": "document description or note",
  "projectName": "project reference if any",
  "vendorAddress": "complete supplier address",
  "buyerTaxId": "customer tax ID",
  "buyerAddress": "complete customer address",
  "descriptionSummary": "summary of all line items",
  "projectAddress": "delivery address if different",
  "projectCity": "delivery city",
  "notes": "additional notes or information",
  "lineItems": [
    {
      "description": "item description",
      "quantity": "quantity as string",
      "unitPrice": "unit price as string",
      "totalPrice": "line total as string",
      "itemType": "item classification if available"
    }
  ],
  "confidenceScore": "0.95"
}` :
      `You are an expert Latin American invoice extraction system. Extract data with maximum accuracy using these specific rules:

${learningImprovements}

🔍 EXTRACTION RULES:
1. VENDOR INFO: Look for "Emisor", "Proveedor", "Razón Social" or company name at top
2. TAX IDs: NIT, RFC, CUIT are always numeric with optional dashes/dots
3. AMOUNTS: Always extract numbers only (no currency symbols, no commas)
4. DATES: Convert to YYYY-MM-DD format, look for "Fecha", "Date"
5. ADDRESSES: Extract complete address including street, city, state
6. PROJECT: Look for "Obra", "Proyecto", "Project" or construction site references

OCR TEXT TO ANALYZE:
${ocrText.substring(0, 4000)} ${ocrText.length > 4000 ? '...[truncated]' : ''}

🎯 CRITICAL EXTRACTION GUIDELINES:
- vendorName: First company name found, usually after "Emisor:" or at document top
- taxId: Vendor's NIT/RFC - numeric string near vendor name
- vendorAddress: Complete address of vendor including city/state
- companyName: Buyer company, usually after "Adquiriente:" or "Cliente:"
- buyerTaxId: Buyer's NIT/RFC - different from vendor's
- invoiceNumber: After "Factura No:", "Invoice:", "Folio:"
- invoiceDate: Date near invoice number, format as YYYY-MM-DD
- totalAmount: Final amount, usually largest number, after "Total:"
- taxAmount: IVA/Tax amount, after "IVA:", "Tax:"
- subtotal: Base amount before tax
- currency: Look for COP, USD, MXN, EUR symbols/text
- projectName: ESSENTIAL - Search for these patterns: "PROYECTO:", "OBRA:", "PROJECT:", "CONTRATO:", construction project names, building names, contract references, work order numbers, or any specific location/project identifiers
- projectAddress: Look for delivery addresses ("Dirección de entrega:", "Lugar de entrega:", "Site:", "Sitio:"), work site addresses, or any address different from vendor/buyer addresses
- projectCity: Extract city from project/delivery context, or look for city names mentioned with project information

Extract amounts as clean numbers: "1,234.56" → "1234.56"
If field not found, return null (not empty string)

Return valid JSON only:

🧩 Extraction Logic:
- Use consistent label recognition across LatAm formats (Colombia, Mexico, etc.)
- Extract buyerTaxId from fields labeled as "NIT del Cliente", "RFC Cliente", or similar
- Use spatial proximity to companyName to identify the correct field
- For projectAddress: Look for specific project location addresses (street addresses like "CALLE 98 # 65 A 54")
- For projectCity: If project city is not explicit, extract city/region from vendorAddress (e.g., "BARRANQUILLA, ATLANTICO, COLOMBIA")
- Return null for any field that is not found in the document
- Extract actual values from the text, don't invent data
- Convert dates to YYYY-MM-DD format
- Extract amounts as decimal strings without currency symbols
- Handle both Spanish and English field labels
- If no clear values found, return null rather than placeholder text`;

    console.log('Sending request to OpenAI...');
    const response = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o-mini", // Faster and cheaper model for invoice extraction
        messages: [
          {
            role: "system",
            content: isXML ? 
              "You are an expert XML invoice parser. Extract structured data from XML content and respond only with valid JSON. Parse XML tags carefully and extract clean values. If XML tags are not found, return null for that field." :
              "You are an expert invoice data extraction system. Extract structured data from OCR text and respond only with valid JSON. Be fast and accurate. If you cannot find a field value, return null for that field."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.0, // Set to 0 for faster, more deterministic responses
        max_tokens: 1500, // Reduced for faster processing
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('AI request timeout')), 15000)
      )
    ]);

    console.log('Received response from OpenAI');
    const responseContent = response.choices[0].message.content;

    if (!responseContent) {
      throw new Error('Empty response from AI service');
    }

    const extractedData = JSON.parse(responseContent);
    console.log('Successfully parsed AI response:', Object.keys(extractedData));

    // Validate and clean the response with better data processing
    const cleanedData = {
      vendorName: validateString(extractedData.vendorName),
      invoiceNumber: validateString(extractedData.invoiceNumber),
      invoiceDate: validateDate(extractedData.invoiceDate),
      dueDate: validateDate(extractedData.dueDate),
      totalAmount: validateAmount(extractedData.totalAmount),
      taxAmount: validateAmount(extractedData.taxAmount),
      subtotal: validateAmount(extractedData.subtotal),
      currency: extractedData.currency || "COP", // Default to COP for Latin American invoices
      taxId: validateTaxId(extractedData.taxId),
      companyName: validateString(extractedData.companyName),
      concept: validateString(extractedData.concept),
      projectName: validateString(extractedData.projectName),
      vendorAddress: validateString(extractedData.vendorAddress),
      buyerTaxId: validateTaxId(extractedData.buyerTaxId),
      buyerAddress: validateString(extractedData.buyerAddress),
      descriptionSummary: validateString(extractedData.descriptionSummary),
      projectAddress: validateString(extractedData.projectAddress),
      projectCity: validateString(extractedData.projectCity),
      notes: validateString(extractedData.notes),
      lineItems: Array.isArray(extractedData.lineItems) ? extractedData.lineItems : [],
      confidenceScore: extractedData.confidenceScore || "0.75",
    };

    // Log extraction quality metrics
    const filledFields = Object.values(cleanedData).filter(v => v !== null && v !== "").length;
    const totalFields = Object.keys(cleanedData).length - 1; // Exclude lineItems
    const completeness = (filledFields / totalFields) * 100;

    console.log(`Extraction completeness: ${completeness.toFixed(1)}% (${filledFields}/${totalFields} fields)`);

    // If completeness is very low, try again with a simplified approach
    if (completeness < 30) {
      console.log('Low completeness detected, attempting simplified extraction...');
      return await attemptSimplifiedExtraction(ocrText);
    }

    // Special handling for XML files with missing amounts
    if (isXML && (!cleanedData.totalAmount || cleanedData.totalAmount === "0.00")) {
      console.log('XML file detected with missing amounts, attempting direct XML parsing...');
      const directAmounts = await extractAmountsDirectlyFromXML(ocrText);
      if (directAmounts.totalAmount) {
        cleanedData.totalAmount = directAmounts.totalAmount;
        cleanedData.taxAmount = directAmounts.taxAmount || cleanedData.taxAmount;
        cleanedData.subtotal = directAmounts.subtotal || cleanedData.subtotal;
        cleanedData.currency = directAmounts.currency || cleanedData.currency;
        console.log('Direct XML parsing found amounts:', directAmounts);
      }
    }

    // Cache the result for performance
    if (extractionCache.size > 100) {
      // Clear old entries if cache gets too large
      const firstKey = extractionCache.keys().next().value;
      extractionCache.delete(firstKey);
    }
    extractionCache.set(cacheKey, cleanedData);

    console.log('AI extraction completed successfully with cleaned data');

    return cleanedData;
  } catch (error: any) {
    console.error("AI extraction failed:", error);

    // Provide more specific error messages
    if (error.message?.includes('API key')) {
      throw new Error('AI service configuration error - please check API key');
    } else if (error.message?.includes('timeout')) {
      throw new Error('AI service timeout - please try again');
    } else if (error.message?.includes('quota')) {
      throw new Error('AI service quota exceeded - please try again later');
    } else {
      throw new Error(`AI data extraction failed: ${error?.message || 'Unknown error'}`);
    }
  }
}

interface ExtractedPurchaseOrderData {
  poId: string | null;
  vendorName: string | null;
  issueDate: string | null;
  expectedDeliveryDate: string | null;
  totalAmount: string | null;
  currency: string;
  projectId: string | null;
  buyerName: string | null;
  buyerAddress: string | null;
  vendorAddress: string | null;
  terms: string | null;
  lineItems: Array<{
    description: string;
    quantity: string;
    unitPrice: string;
    totalPrice: string;
  }>;
  confidenceScore: string;
}

export async function extractPurchaseOrderData(ocrText: string): Promise<ExtractedPurchaseOrderData> {
  try {
    const purchaseOrderPrompt = `You will be given the raw OCR text of an inventory entry document in Spanish.

Please extract the following fields and return them in clean JSON format:

- "entrada_almacen_no": (Entrada de Almacén No.)
- "empresa": (Buyer Company Name)
- "nit_empresa": (Buyer Tax ID)
- "direccion_empresa": (Buyer Address)
- "ciudad_empresa": (Buyer City)
- "proveedor": (Vendor Name)
- "direccion_proveedor": (Vendor Address)
- "nit_proveedor": (Vendor Tax ID)
- "proyecto": (Project Name)
- "orden_compra_no": (Purchase Order Number - after "Orden de Compra No")
- "fecha_factura": (Invoice Date - after "Fecha Factura")
- "fecha_remision": (Remission Date - after "Fecha Remisión")
- "sitio_entrega": (Site of delivery - after "Sitio de entrega")
- "descripcion_oc": (Description OC - after "Descripción OC")
- "observaciones_oc": (Observations OC - after "Observaciones OC")

Then extract the "detalle_entrada_almacen" table:
Return it as a list of rows with this format:
  - "concepto" (item name/description)
  - "vr_iva" (VAT amount)
  - "vr_total" (Total amount)

Lastly, return the summary:
- "subtotal"
- "iva_total"
- "total_general"

All numeric fields should be parsed cleanly without formatting characters (no $ or commas).
If some fields are missing from OCR, return empty strings or 0, but never null.
Return valid JSON only.

Document:
${ocrText}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: "You are a document parser that returns clean JSON." 
        },
        { 
          role: "user", 
          content: purchaseOrderPrompt 
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.0,
      max_tokens: 2000
    });

    const extractedData = JSON.parse(response.choices[0].message.content || '{}');

    // Create line items from detalle_entrada_almacen
    let lineItems = [];
    if (Array.isArray(extractedData.detalle_entrada_almacen)) {
      lineItems = extractedData.detalle_entrada_almacen.map((item: any) => ({
        description: item.concepto || "",
        quantity: "1",
        unitPrice: (item.vr_total || 0).toString(),
        totalPrice: (item.vr_total || 0).toString()
      }));
    } else {
      // Create a default item if none found
      lineThis change addresses the issue of subtotal extraction from XML invoices.
<replit_final_file>
import OpenAI from "openai";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || ""
});

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

// Helper functions for data validation
function validateString(value: any): string | null {
  if (!value || typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function validateAmount(value: any): string | null {
  if (!value) return null;

  // For XML processing, be more lenient with amount formatting
  let cleaned = String(value).trim();

  // Remove XML tags if present
  cleaned = cleaned.replace(/<[^>]*>/g, '');

  // Remove any whitespace and non-numeric characters except decimal separators
  cleaned = cleaned.replace(/\s+/g, '');
  cleaned = cleaned.replace(/[^\d.,-]/g, '');

  // Skip if no digits found
  if (!/\d/.test(cleaned)) return null;

  // Handle different decimal separators and thousand separators
  // Colombian format: 1.234.567,89 or international: 1,234,567.89
  if (cleaned.includes(',') && cleaned.includes('.')) {
    const lastComma = cleaned.lastIndexOf(',');
    const lastPeriod = cleaned.lastIndexOf('.');

    if (lastComma > lastPeriod) {
      // Format: 1.234.567,89 (European/Colombian)
      const parts = cleaned.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        cleaned = parts[0].replace(/\./g, '') + '.' + parts[1];
      }
    } else {
      // Format: 1,234,567.89 (US)
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    // Only comma present
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      // Decimal separator: 1234,89
      cleaned = parts[0] + '.' + parts[1];
    } else {
      // Thousands separator: 1,234,567
      cleaned = cleaned.replace(/,/g, '');
    }
  }

  // Final cleanup - ensure only one decimal point
  const decimalParts = cleaned.split('.');
  if (decimalParts.length > 2) {
    // Multiple decimals - keep the last one as decimal separator
    const lastDecimal = decimalParts.pop();
    cleaned = decimalParts.join('') + '.' + lastDecimal;
  }

  const num = parseFloat(cleaned);
  return !isNaN(num) && num >= 0 ? num.toFixed(2) : null;
}

function validateDate(value: any): string | null {
  if (!value) return null;
  try {
    const date = new Date(value);
    return !isNaN(date.getTime()) ? date.toISOString().split('T')[0] : null;
  } catch {
    return null;
  }
}

function validateTaxId(value: any): string | null {
  if (!value) return null;
  const cleaned = String(value).replace(/[^\d-]/g, '');
  return cleaned.length >= 5 ? cleaned : null;
}

// Simplified extraction for difficult documents
async function attemptSimplifiedExtraction(ocrText: string): Promise<ExtractedInvoiceData> {
  const simplePrompt = `Extract only the most obvious fields from this invoice text:
${ocrText.substring(0, 2000)}

Return JSON with these fields only (use null if not found):
{
  "vendorName": "first company name found",
  "totalAmount": "largest monetary amount",
  "invoiceNumber": "invoice/factura number",
  "invoiceDate": "date in YYYY-MM-DD format",
  "currency": "COP/USD/MXN"
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Extract only the most obvious invoice fields. Return valid JSON." },
      { role: "user", content: simplePrompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.0,
    max_tokens: 500
  });

  const simpleData = JSON.parse(response.choices[0].message.content || '{}');

  return {
    vendorName: simpleData.vendorName || null,
    invoiceNumber: simpleData.invoiceNumber || null,
    invoiceDate: simpleData.invoiceDate || null,
    dueDate: null,
    totalAmount: simpleData.totalAmount || null,
    taxAmount: null,
    subtotal: null,
    currency: simpleData.currency || "COP",
    taxId: null,
    companyName: null,
    concept: null,
    projectName: null,
    vendorAddress: null,
    buyerTaxId: null,
    buyerAddress: null,
    descriptionSummary: null,
    projectAddress: null,
    projectCity: null,
    notes: null,
    lineItems: [],
    confidenceScore: "0.5"
  };
}

// Simple cache for repeated extractions
const extractionCache = new Map<string, ExtractedInvoiceData>();

// Direct XML parsing function for amount extraction
async function extractAmountsDirectlyFromXML(xmlContent: string): Promise<{
  totalAmount: string | null;
  taxAmount: string | null;
  subtotal: string | null;
  currency: string;
}> {
  try {
    // Use regex to find amount fields with currency attributes
    const amountPatterns = [
      /<cbc:TaxInclusiveAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:TaxInclusiveAmount>/gi,
      /<cbc:PayableAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:PayableAmount>/gi,
      /<cbc:TaxExclusiveAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:TaxExclusiveAmount>/gi,
      /<cbc:TaxAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:TaxAmount>/gi,
      /<cbc:LineExtensionAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:LineExtensionAmount>/gi,
    ];

    let totalAmount = null;
    let taxAmount = null;
    let subtotal = null;
    let currency = "COP";

    // Search for TaxInclusiveAmount or PayableAmount as total
    let match;
    const taxInclusivePattern = /<cbc:TaxInclusiveAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:TaxInclusiveAmount>/gi;
    while ((match = taxInclusivePattern.exec(xmlContent)) !== null) {
      currency = match[1];
      totalAmount = validateAmount(match[2]);
      if (totalAmount) break;
    }

    // If no TaxInclusiveAmount, try PayableAmount
    if (!totalAmount) {
      const payablePattern = /<cbc:PayableAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:PayableAmount>/gi;
      while ((match = payablePattern.exec(xmlContent)) !== null) {
        currency = match[1];
        totalAmount = validateAmount(match[2]);
        if (totalAmount) break;
      }
    }

    // Search for TaxAmount
    const taxPattern = /<cbc:TaxAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:TaxAmount>/gi;
    while ((match = taxPattern.exec(xmlContent)) !== null) {
      currency = match[1];
      taxAmount = validateAmount(match[2]);
      if (taxAmount) break;
    }

    // Search for TaxExclusiveAmount as subtotal
    const subtotalPattern = /<cbc:TaxExclusiveAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:TaxExclusiveAmount>/gi;
    while ((match = subtotalPattern.exec(xmlContent)) !== null) {
      currency = match[1];
      subtotal = validateAmount(match[2]);
      if (subtotal) break;
    }

    // If no subtotal found, try LineExtensionAmount
    if (!subtotal) {
      const lineExtensionPattern = /<cbc:LineExtensionAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:LineExtensionAmount>/gi;
      while ((match = lineExtensionPattern.exec(xmlContent)) !== null) {
        currency = match[1];
        subtotal = validateAmount(match[2]);
        if (subtotal) break;
      }
    }

    // If we have total and tax but no subtotal, calculate it
    if (totalAmount && taxAmount && !subtotal) {
      const totalNum = parseFloat(totalAmount);
      const taxNum = parseFloat(taxAmount);
      if (!isNaN(totalNum) && !isNaN(taxNum)) {
        subtotal = (totalNum - taxNum).toFixed(2);
      }
    }

    console.log('Direct XML extraction results:', { totalAmount, taxAmount, subtotal, currency });
    return { totalAmount, taxAmount, subtotal, currency };
  } catch (error) {
    console.error('Direct XML parsing failed:', error);
    return { totalAmount: null, taxAmount: null, subtotal: null, currency: "COP" };
  }
}

export async function extractInvoiceData(ocrText: string, applyLearning: boolean = true): Promise<ExtractedInvoiceData> {
  try {
    console.log(`Starting AI extraction with ${ocrText.length} characters of OCR text`);

    if (!ocrText || ocrText.trim().length < 10) {
      throw new Error('Insufficient OCR text for AI extraction');
    }

    // Check cache first for performance
    const cacheKey = ocrText.substring(0, 500); // Use first 500 chars as cache key
    if (extractionCache.has(cacheKey)) {
      console.log('Using cached extraction result');
      return extractionCache.get(cacheKey)!;
    }

    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY_ENV_VAR) {
      console.error('OpenAI API key not found in environment variables');
      throw new Error('AI service configuration error - API key missing');
    }

    // Apply learning improvements if enabled
    let learningImprovements = "";
    if (applyLearning) {
      const { storage } = await import('../storage');
      const insights = await storage.getLearningInsights();

      if (insights.length > 0) {
        learningImprovements = `\n\n🎯 LEARNING IMPROVEMENTS (Based on Previous Errors):
${insights.map(insight => `- ${insight.field}: ${insight.suggestedFix} (seen ${insight.frequency} times)`).join('\n')}
\nPay special attention to these fields and avoid these common mistakes.

🔧 FIELD-SPECIFIC IMPROVEMENTS:
- For vendorName: Look for company name immediately after "Emisor:" or "Proveedor:"
- For totalAmount: Find the largest monetary amount, usually after "Total:" or "Total a Pagar:"
- For taxId: Look for NIT/RFC patterns - numbers with dashes (e.g., 12-3456789-1)
- For invoiceDate: Find date near invoice number, convert to YYYY-MM-DD format
- For projectName: CRITICAL - Look for these patterns: "PROYECTO:", "OBRA:", "Project:", "CONTRACT:", "CONTRATO:", project codes, construction site names, building names, or any reference to specific work locations
- For projectAddress: Look for delivery addresses, work site addresses, or addresses mentioned in project context that differ from company addresses
- For projectCity: Extract city from project/delivery context, or look for city names mentioned with project information`;
      }
    }

    // Detect if this is XML content
    const isXML = ocrText.trim().startsWith('<?xml') || ocrText.includes('<Invoice') || ocrText.includes('<Factura') || ocrText.includes('<cbc:') || ocrText.includes('<cac:');
    console.log(`Processing ${isXML ? 'XML' : 'OCR'} content for extraction`);

    let extractedData: any = {};

    // Check if this is XML content and use specialized parsing
    const isXMLContent = ocrText.trim().startsWith('<?xml') || ocrText.includes('<Invoice') || ocrText.includes('<cac:') || ocrText.includes('<cbc:');

    let xmlContent = null;
    if (isXMLContent) {
      xmlContent = ocrText;
      console.log('XML content detected, will use direct parsing for amounts');

      // Try using the dedicated XML parser first
      try {
        const { parseInvoiceXML } = await import('./xmlParser');
        const xmlParsedData = parseInvoiceXML(xmlContent);

        if (xmlParsedData.totalAmount || xmlParsedData.taxAmount || xmlParsedData.subtotal) {
          console.log('XML parser extracted amounts:', {
            totalAmount: xmlParsedData.totalAmount,
            taxAmount: xmlParsedData.taxAmount,
            subtotal: xmlParsedData.subtotal,
            currency: xmlParsedData.currency
          });

          // Use XML parser results as base and merge with AI results
          extractedData = {
            ...extractedData,
            ...xmlParsedData
          };
        }
      } catch (xmlParseError) {
        console.error('XML parser failed, falling back to AI extraction:', xmlParseError);
      }
    }

    const prompt = isXML ? 
      `You are an expert XML invoice parser specialized in Latin American electronic invoices (UBL 2.1, DIAN Colombia format). Extract ALL possible structured data from this XML document:

${learningImprovements}

🔍 COMPREHENSIVE XML EXTRACTION RULES WITH PRIORITY ON AMOUNTS:
1. AMOUNTS (HIGHEST PRIORITY): Search exhaustively for ALL monetary values in these patterns:
   - <cbc:TaxInclusiveAmount currencyID="COP">VALUE</cbc:TaxInclusiveAmount>
   - <cbc:PayableAmount currencyID="COP">VALUE</cbc:PayableAmount>
   - <cbc:TaxExclusiveAmount currencyID="COP">VALUE</cbc:TaxExclusiveAmount>
   - <cbc:TaxAmount currencyID="COP">VALUE</cbc:TaxAmount>
   - <cbc:LineExtensionAmount currencyID="COP">VALUE</cbc:LineExtensionAmount>
   - <cbc:Amount currencyID="COP">VALUE</cbc:Amount>
   - <cbc:TaxableAmount currencyID="COP">VALUE</cbc:TaxableAmount>
   - <cbc:BaseAmount currencyID="COP">VALUE</cbc:BaseAmount>
   - ANY tag containing "Amount" with numeric content and currencyID

2. VENDOR/SUPPLIER INFO: Look for <cac:AccountingSupplierParty>, <cac:SenderParty>, <cac:PartyTaxScheme>
3. CUSTOMER/BUYER INFO: Look for <cac:AccountingCustomerParty>, <cac:ReceiverParty>
4. TAX IDs: Find <cbc:CompanyID>, <cbc:IdentificationCode> - extract complete values including dashes
5. DATES: Find <cbc:IssueDate>, <cbc:DueDate>, <cbc:Date> tags, convert to YYYY-MM-DD
6. ADDRESSES: Extract from <cbc:StreetName>, <cbc:CityName>, <cbc:PostalZone>, <cbc:CountrySubentity>
7. INVOICE DETAILS: Look for <cbc:ID>, <cbc:UUID>, <cbc:Description>, <cbc:Note>
8. LINE ITEMS: Extract from <cac:InvoiceLine>, <cac:Item>, <cbc:InvoicedQuantity>, <cbc:Price>
9. PROJECT INFORMATION: Look for project references in notes, descriptions, delivery addresses, and contract references

FULL XML CONTENT TO ANALYZE:
${ocrText.substring(0, 15000)} ${ocrText.length > 15000 ? '...[truncated for length]' : ''}

🎯 ENHANCED FIELD MAPPING (FOCUS ON AMOUNTS AND PROJECT EXTRACTION):
- totalAmount: PRIORITY ORDER: <cbc:TaxInclusiveAmount> > <cbc:PayableAmount> > <cbc:TaxExclusiveAmount> > any <cbc:*Amount> with highest value
- taxAmount: PRIORITY ORDER: <cbc:TaxAmount> > <cbc:TaxableAmount> > sum of all tax subtotals
- subtotal: PRIORITY ORDER: <cbc:TaxExclusiveAmount> > <cbc:LineExtensionAmount> > <cbc:BaseAmount> > totalAmount minus taxAmount
- currency: EXTRACT from currencyID attribute (COP, USD, EUR, etc.) - look in ALL amount fields
- vendorName: <cbc:RegistrationName> in <cac:AccountingSupplierParty> OR <cac:Party> within supplier context
- taxId: <cbc:CompanyID> in supplier's <cac:PartyTaxScheme> or <cac:PartyIdentification>
- vendorAddress: Complete address from supplier's <cac:PostalAddress>: <cbc:StreetName>, <cbc:CityName>, <cbc:CountrySubentity>
- companyName: <cbc:RegistrationName> in <cac:AccountingCustomerParty> OR buyer party
- buyerTaxId: <cbc:CompanyID> in customer's <cac:PartyTaxScheme>
- buyerAddress: Complete address from customer's <cac:PostalAddress>
- invoiceNumber: <cbc:ID> at document root level OR <cbc:UUID>
- invoiceDate: <cbc:IssueDate> at document level
- dueDate: <cbc:DueDate> if available
- concept: <cbc:Note> OR <cbc:Description> at document level
- notes: Any additional <cbc:Note> or <cbc:AdditionalInformation>
- projectName: EXTRACT project names using these methods in order: 1) Search for text patterns like "Proyecto:", "Obra:", "Proyecto No:", "Project:", followed by project name, 2) Look in <cbc:Note> fields for project references, 3) Check <cac:ProjectReference><cbc:ID>, 4) Look in <cac:OrderReference> or <cac:ContractDocumentReference> tags, 5) Search line item descriptions for project mentions
- projectAddress: EXTRACT from <cac:DeliveryAddress> OR look for address patterns in notes/descriptions that differ from vendor/buyer addresses
- projectCity: <cbc:CityName> from <cac:DeliveryAddress> OR extract city from project address if different from vendor/buyer cities
- descriptionSummary: Concatenate item descriptions from <cac:InvoiceLine>

CRITICAL AMOUNT EXTRACTION LOGIC:
1. EXHAUSTIVE SEARCH: Scan the ENTIRE XML for ANY tag containing "Amount" - don't miss any monetary values
2. CURRENCY DETECTION: Extract currencyID="XXX" from amount tags - this is crucial for proper display
3. NUMERIC VALIDATION: Extract only the numeric content from amount tags, preserve decimals
4. FALLBACK STRATEGY: If standard UBL tags not found, look for similar patterns or Spanish equivalents
5. MULTIPLE AMOUNTS: If multiple amounts found, prioritize the largest for totalAmount
6. TAX CALCULATION: Try to calculate missing amounts (subtotal = total - tax) if some amounts missing
7. PROJECT NAME EXTRACTION: Look for "Proyecto" text pattern in XML content and extract the phrase/text immediately following it

ADVANCED PARSING INSTRUCTIONS FOR AMOUNTS:
- Search case-insensitively for amount patterns
- Handle both English and Spanish XML namespaces
- Extract decimal amounts with proper precision (2 decimal places)
- Look for amounts in nested structures like <cac:TaxTotal><cac:TaxSubtotal><cbc:TaxAmount>
- Check for amounts in line items and aggregate if needed
- Preserve currency information from currencyID attributes

Return complete JSON with ALL extracted fields (extract amounts even if other fields fail):

{
  "vendorName": "extracted supplier company name",
  "invoiceNumber": "document ID or UUID",
  "invoiceDate": "YYYY-MM-DD format",
  "dueDate": "YYYY-MM-DD or null",
  "totalAmount": "final amount as decimal string",
  "taxAmount": "tax total as decimal string",
  "subtotal": "pre-tax amount as decimal string",
  "currency": "currency code from XML",
  "taxId": "supplier tax ID",
  "companyName": "customer company name",
  "concept": "document description or note",
  "projectName": "project reference if any",
  "vendorAddress": "complete supplier address",
  "buyerTaxId": "customer tax ID",
  "buyerAddress": "complete customer address",
  "descriptionSummary": "summary of all line items",
  "projectAddress": "delivery address if different",
  "projectCity": "delivery city",
  "notes": "additional notes or information",
  "lineItems": [
    {
      "description": "item description",
      "quantity": "quantity as string",
      "unitPrice": "unit price as string",
      "totalPrice": "line total as string",
      "itemType": "item classification if available"
    }
  ],
  "confidenceScore": "0.95"
}` :
      `You are an expert Latin American invoice extraction system. Extract data with maximum accuracy using these specific rules:

${learningImprovements}

🔍 EXTRACTION RULES:
1. VENDOR INFO: Look for "Emisor", "Proveedor", "Razón Social" or company name at top
2. TAX IDs: NIT, RFC, CUIT are always numeric with optional dashes/dots
3. AMOUNTS: Always extract numbers only (no currency symbols, no commas)
4. DATES: Convert to YYYY-MM-DD format, look for "Fecha", "Date"
5. ADDRESSES: Extract complete address including street, city, state
6. PROJECT: Look for "Obra", "Proyecto", "Project" or construction site references

OCR TEXT TO ANALYZE:
${ocrText.substring(0, 4000)} ${ocrText.length > 4000 ? '...[truncated]' : ''}

🎯 CRITICAL EXTRACTION GUIDELINES:
- vendorName: First company name found, usually after "Emisor:" or at document top
- taxId: Vendor's NIT/RFC - numeric string near vendor name
- vendorAddress: Complete address of vendor including city/state
- companyName: Buyer company, usually after "Adquiriente:" or "Cliente:"
- buyerTaxId: Buyer's NIT/RFC - different from vendor's
- invoiceNumber: After "Factura No:", "Invoice:", "Folio:"
- invoiceDate: Date near invoice number, format as YYYY-MM-DD
- totalAmount: Final amount, usually largest number, after "Total:"
- taxAmount: IVA/Tax amount, after "IVA:", "Tax:"
- subtotal: Base amount before tax
- currency: Look for COP, USD, MXN, EUR symbols/text
- projectName: ESSENTIAL - Search for these patterns: "PROYECTO:", "OBRA:", "PROJECT:", "CONTRATO:", construction project names, building names, contract references, work order numbers, or any specific location/project identifiers
- projectAddress: Look for delivery addresses ("Dirección de entrega:", "Lugar de entrega:", "Site:", "Sitio:"), work site addresses, or any address different from vendor/buyer addresses
- projectCity: Extract city from project/delivery context, or look for city names mentioned with project information

Extract amounts as clean numbers: "1,234.56" → "1234.56"
If field not found, return null (not empty string)

Return valid JSON only:

🧩 Extraction Logic:
- Use consistent label recognition across LatAm formats (Colombia, Mexico, etc.)
- Extract buyerTaxId from fields labeled as "NIT del Cliente", "RFC Cliente", or similar
- Use spatial proximity to companyName to identify the correct field
- For projectAddress: Look for specific project location addresses (street addresses like "CALLE 98 # 65 A 54")
- For projectCity: If project city is not explicit, extract city/region from vendorAddress (e.g., "BARRANQUILLA, ATLANTICO, COLOMBIA")
- Return null for any field that is not found in the document
- Extract actual values from the text, don't invent data
- Convert dates to YYYY-MM-DD format
- Extract amounts as decimal strings without currency symbols
- Handle both Spanish and English field labels
- If no clear values found, return null rather than placeholder text`;

    console.log('Sending request to OpenAI...');
    const response = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o-mini", // Faster and cheaper model for invoice extraction
        messages: [
          {
            role: "system",
            content: isXML ? 
              "You are an expert XML invoice parser. Extract structured data from XML content and respond only with valid JSON. Parse XML tags carefully and extract clean values. If XML tags are not found, return null for that field." :
              "You are an expert invoice data extraction system. Extract structured data from OCR text and respond only with valid JSON. Be fast and accurate. If you cannot find a field value, return null for that field."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.0, // Set to 0 for faster, more deterministic responses
        max_tokens: 1500, // Reduced for faster processing
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('AI request timeout')), 15000)
      )
    ]);

    console.log('Received response from OpenAI');
    const responseContent = response.choices[0].message.content;

    if (!responseContent) {
      throw new Error('Empty response from AI service');
    }

    const extractedData = JSON.parse(responseContent);
    console.log('Successfully parsed AI response:', Object.keys(extractedData));

    // Validate and clean the response with better data processing
    const cleanedData = {
      vendorName: validateString(extractedData.vendorName),
      invoiceNumber: validateString(extractedData.invoiceNumber),
      invoiceDate: validateDate(extractedData.invoiceDate),
      dueDate: validateDate(extractedData.dueDate),
      totalAmount: validateAmount(extractedData.totalAmount),
      taxAmount: validateAmount(extractedData.taxAmount),
      subtotal: validateAmount(extractedData.subtotal),
      currency: extractedData.currency || "COP", // Default to COP for Latin American invoices
      taxId: validateTaxId(extractedData.taxId),
      companyName: validateString(extractedData.companyName),
      concept: validateString(extractedData.concept),
      projectName: validateString(extractedData.projectName),
      vendorAddress: validateString(extractedData.vendorAddress),
      buyerTaxId: validateTaxId(extractedData.buyerTaxId),
      buyerAddress: validateString(extractedData.buyerAddress),
      descriptionSummary: validateString(extractedData.descriptionSummary),
      projectAddress: validateString(extractedData.projectAddress),
      projectCity: validateString(extractedData.projectCity),
      notes: validateString(extractedData.notes),
      lineItems: Array.isArray(extractedData.lineItems) ? extractedData.lineItems : [],
      confidenceScore: extractedData.confidenceScore || "0.75",
    };

    // Log extraction quality metrics
    const filledFields = Object.values(cleanedData).filter(v => v !== null && v !== "").length;
    const totalFields = Object.keys(cleanedData).length - 1; // Exclude lineItems
    const completeness = (filledFields / totalFields) * 100;

    console.log(`Extraction completeness: ${completeness.toFixed(1)}% (${filledFields}/${totalFields} fields)`);

    // If completeness is very low, try again with a simplified approach
    if (completeness < 30) {
      console.log('Low completeness detected, attempting simplified extraction...');
      return await attemptSimplifiedExtraction(ocrText);
    }

    // Special handling for XML files with missing amounts
    if (isXML && (!cleanedData.totalAmount || cleanedData.totalAmount === "0.00")) {
      console.log('XML file detected with missing amounts, attempting direct XML parsing...');
      const directAmounts = await extractAmountsDirectlyFromXML(ocrText);
      if (directAmounts.totalAmount) {
        cleanedData.totalAmount = directAmounts.totalAmount;
        cleanedData.taxAmount = directAmounts.taxAmount || cleanedData.taxAmount;
        cleanedData.subtotal = directAmounts.subtotal || cleanedData.subtotal;
        cleanedData.currency = directAmounts.currency || cleanedData.currency;
        console.log('Direct XML parsing found amounts:', directAmounts);
      }
    }

    // Cache the result for performance
    if (extractionCache.size > 100) {
      // Clear old entries if cache gets too large
      const firstKey = extractionCache.keys().next().value;
      extractionCache.delete(firstKey);
    }
    extractionCache.set(cacheKey, cleanedData);

    console.log('AI extraction completed successfully with cleaned data');

    return cleanedData;
  } catch (error: any) {
    console.error("AI extraction failed:", error);

    // Provide more specific error messages
    if (error.message?.includes('API key')) {
      throw new Error('AI service configuration error - please check API key');
    } else if (error.message?.includes('timeout')) {
      throw new Error('AI service timeout - please try again');
    } else if (error.message?.includes('quota')) {
      throw new Error('AI service quota exceeded - please try again later');
    } else {
      throw new Error(`AI data extraction failed: ${error?.message || 'Unknown error'}`);
    }
  }
}

interface ExtractedPurchaseOrderData {
  poId: string | null;
  vendorName: string | null;
  issueDate: string | null;
  expectedDeliveryDate: string | null;
  totalAmount: string | null;
  currency: string;
  projectId: string | null;
  buyerName: string | null;
  buyerAddress: string | null;
  vendorAddress: string | null;
  terms: string | null;
  lineItems: Array<{
    description: string;
    quantity: string;
    unitPrice: string;
    totalPrice: string;
  }>;
  confidenceScore: string;
}

export async function extractPurchaseOrderData(ocrText: string): Promise<ExtractedPurchaseOrderData> {
  try {
    const purchaseOrderPrompt = `You will be given the raw OCR text of an inventory entry document in Spanish.

Please extract the following fields and return them in clean JSON format:

- "entrada_almacen_no": (Entrada de Almacén No.)
- "empresa": (Buyer Company Name)
- "nit_empresa": (Buyer Tax ID)
- "direccion_empresa": (Buyer Address)
- "ciudad_empresa": (Buyer City)
- "proveedor": (Vendor Name)
- "direccion_proveedor": (Vendor Address)
- "nit_proveedor": (Vendor Tax ID)
- "proyecto": (Project Name)
- "orden_compra_no": (Purchase Order Number - after "Orden de Compra No")
- "fecha_factura": (Invoice Date - after "Fecha Factura")
- "fecha_remision": (Remission Date - after "Fecha Remisión")
- "sitio_entrega": (Site of delivery - after "Sitio de entrega")
- "descripcion_oc": (Description OC - after "Descripción OC")
- "observaciones_oc": (Observations OC - after "Observaciones OC")

Then extract the "detalle_entrada_almacen" table:
Return it as a list of rows with this format:
  - "concepto" (item name/description)
  - "vr_iva" (VAT amount)
  - "vr_total" (Total amount)

Lastly, return the summary:
- "subtotal"
- "iva_total"
- "total_general"

All numeric fields should be parsed cleanly without formatting characters (no $ or commas).
If some fields are missing from OCR, return empty strings or 0, but never null.
Return valid JSON only.

Document:
${ocrText}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: "You are a document parser that returns clean JSON." 
        },
        { 
          role: "user", 
          content: purchaseOrderPrompt 
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.0,
      max_tokens: 2000
    });

    const extractedData = JSON.parse(response.choices[0].message.content || '{}');

    // Create line items from detalle_entrada_almacen
    let lineItems = [];
    if (Array.isArray(extractedData.detalle_entrada_almacen)) {
      lineItems = extractedData.detalle_entrada_almacen.map((item: any) => ({
        description: item.concepto || "",
        quantity: "1",
        unitPrice: (item.vr_total || 0).toString(),
        totalPrice: (item.vr_total || 0).toString()
      }));
    } else {
      // Create a default item if none found
      lineItems = [{
        items = [{
        description: "Purchase order item",
        quantity: "1",
        unitPrice: (extractedData.total_general || 0).toString(),
        totalPrice: (extractedData.total_general || 0).toString()
      }];
    }

    // Map extracted data to expected format
    // Use entrada_almacen_no as the primary unique identifier, fallback to orden_compra_no
    const uniquePoId = extractedData.entrada_almacen_no || extractedData.orden_compra_no || `PO-${Date.now()}`;

    return {
      poId: uniquePoId,
      vendorName: extractedData.proveedor || "",
      issueDate: extractedData.fecha_factura || "",
      expectedDeliveryDate: extractedData.fecha_remision || "",
      totalAmount: (extractedData.total_general || 0).toString(),
      currency: "COP",
      projectId: extractedData.proyecto || "",
      buyerName: extractedData.empresa || "",
      buyerAddress: extractedData.direccion_empresa || "",
      vendorAddress: extractedData.direccion_proveedor || "",
      terms: extractedData.observaciones_oc || extractedData.descripcion_oc || "",
      lineItems: lineItems,
      confidenceScore: "0.85",
      // Store the original orden_compra_no in the items for reference
      originalOrderNumber: extractedData.orden_compra_no || "",
    };
  } catch (error: any) {
    console.error("AI PO extraction failed:", error);
    throw new Error(`AI purchase order extraction failed: ${error?.message || 'Unknown error'}`);
  }
}

// Helper function for fuzzy project matching
export async function findBestProjectMatch(extractedProjectName: string, allProjects: any[]): Promise<string | null> {
  if (!extractedProjectName || !allProjects.length) return null;

  let bestMatch = { project: null, score: 0 };

  for (const project of allProjects) {
    const similarity = calculateStringSimilarity(extractedProjectName.toLowerCase(), project.name.toLowerCase());

    // Use a lower threshold for fuzzy matching (60% instead of exact match)
    if (similarity > bestMatch.score && similarity >= 60) {
      bestMatch = { project, score: similarity };
    }
  }

  return bestMatch.project?.projectId || null;
}

// Simple string similarity function using Levenshtein distance
function calculateStringSimilarity(str1: string, str2: string): number {
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 100;

  const distance = levenshteinDistance(str1, str2);
  return ((maxLength - distance) / maxLength) * 100;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

export async function validateInvoiceData(invoiceData: any): Promise<{
  isValid: boolean;
  issues: string[];
  suggestions: string[];
}> {
  try {
    const prompt = `Analyze this invoice data for validation issues and provide suggestions:

Invoice Data:
${JSON.stringify(invoiceData, null, 2)}

Analyze for:
- Missing required fields
- Data consistency issues
- Unusual amounts or dates
- Formatting problems
- Potential errors

Respond with JSON:
{
  "isValid": boolean,
  "issues": ["list of problems found"],
  "suggestions": ["list of recommendations"]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an invoice validation expert. Analyze invoice data for errors and provide actionable suggestions."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    return JSON.parse(response.choices[0].message.content || '{}');
  } catch (error) {
    console.error("AI validation failed:", error);
    return {
      isValid: false,
      issues: ["AI validation service unavailable"],
      suggestions: ["Please review the invoice data manually"],
    };
  }
}