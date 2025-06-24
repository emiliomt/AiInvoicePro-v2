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

export async function extractInvoiceData(ocrText: string): Promise<ExtractedInvoiceData> {
  try {
    const prompt = `You are an intelligent document parser specialized in Latin American electronic invoices. Your task is to extract structured data from raw OCR text or plain PDF content. Extract the fields consistently, using contextual logic to improve accuracy.

OCR Text:
${ocrText}

🔹 Core Fields to Extract - Return as JSON:
{
  "vendorName": "...",                      // Emisor / Proveedor / Razón Social
  "taxId": "...",                           // Vendor NIT / RFC / CUIT
  "vendorAddress": "...",                   // Full vendor address including city, state, country
  "companyName": "...",                     // Cliente / Adquiriente / Buyer
  "buyerTaxId": "...",                      // Buyer NIT / RFC / CUIT
  "buyerAddress": "...",
  "invoiceNumber": "...",                   // Nro. Factura / Folio
  "invoiceDate": "YYYY-MM-DD",              // Fecha de emisión
  "dueDate: "YYYY-MM-DD",                  // Fecha de vencimiento
  "subtotal": "0.00",
  "taxAmount": "0.00",
  "totalAmount": "0.00",
  "currency": "COP",                        // COP / MXN / USD, etc.
  "concept": "...",                         // Raw line item descriptions
  "descriptionSummary": "...",              // One-line summary of services/goods
  "projectName": "...",                     // Project or Obra (e.g. Etapa II)
  "projectAddress": "...",                  // Extract specific project address (e.g., CALLE 98 # 65 A 54)
  "projectCity": "...",                     // Extract city from vendor address if project city not explicit (e.g., BARRANQUILLA, ATLANTICO, COLOMBIA)
  "notes": "...",                           // Additional observations or terms
  "lineItems": [
    {
      "description": "...",
      "unitPrice": "0.00",
      "quantity": "0",
      "totalPrice": "0.00",
      "itemType": "Labor"                   // or "Materials"
    }
  ],
  "confidenceScore": "0.00"                 // 0-1 confidence score
}

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
- Handle both Spanish and English field labels`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Faster and cheaper model for invoice extraction
      messages: [
        {
          role: "system",
          content: "You are an expert invoice data extraction system. Extract structured data from OCR text and respond only with valid JSON. Be fast and accurate."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.0, // Set to 0 for faster, more deterministic responses
      max_tokens: 2000, // Limit tokens for faster response
    });

    const extractedData = JSON.parse(response.choices[0].message.content || '{}');

    // Validate and clean the response
    return {
      vendorName: extractedData.vendorName || null,
      invoiceNumber: extractedData.invoiceNumber || null,
      invoiceDate: extractedData.invoiceDate || null,
      dueDate: extractedData.dueDate || null,
      totalAmount: extractedData.totalAmount || null,
      taxAmount: extractedData.taxAmount || null,
      subtotal: extractedData.subtotal || null,
      currency: extractedData.currency || "USD",
      taxId: extractedData.taxId || null,
      companyName: extractedData.companyName || null,
      concept: extractedData.concept || null,
      projectName: extractedData.projectName || null,
      vendorAddress: extractedData.vendorAddress || null,
      buyerTaxId: extractedData.buyerTaxId || null,
      buyerAddress: extractedData.buyerAddress || null,
      descriptionSummary: extractedData.descriptionSummary || null,
      projectAddress: extractedData.projectAddress || null,
      projectCity: extractedData.projectCity || null,
      notes: extractedData.notes || null,
      lineItems: Array.isArray(extractedData.lineItems) ? extractedData.lineItems : [],
      confidenceScore: extractedData.confidenceScore || "0.0",
    };
  } catch (error: any) {
    console.error("AI extraction failed:", error);
    throw new Error(`AI data extraction failed: ${error?.message || 'Unknown error'}`);
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
    const prompt = `You are an expert document parser. Extract structured data from a scanned Spanish purchase order PDF. Output clean JSON, formatted for database ingestion. Do not return nulls; instead return empty strings or default values where applicable. All fields must be present.

Extract the following fields from the purchase order:

🔹 **Buyer Info**
- buyer_company_name (default: "")
- buyer_tax_id (default: "")
- buyer_address
- buyer_city

🔹 **Vendor Info**
- vendor_company_name (from field 'Proveedor')
- vendor_tax_id (NIT/CC)
- vendor_address

🔹 **Purchase Order Metadata**
- po_number (from 'Orden de Compra')
- project_name (from 'Proyecto')
- description_oc (from 'Descripción OC')
- site_of_delivery (from 'Sitio de entrega')
- observations_oc (long paragraph below 'Observaciones OC')
- invoice_number (from 'Factura No')
- invoice_date
- remission_number
- remission_date

🔹 **Items** (⚠️ Must be an array):
Each object should contain:
- item_description (required)
- unit_of_measure (UM)
- quantity (number)
- unit_price (number)
- iva_amount (number)
- total_price (number)

If unit price is not found, try to infer it using total_price ÷ quantity.
If any of these values are missing, use 0 as fallback — but NEVER leave the item or field out.

🔹 **Summary**
- subtotal
- iva
- total_amount

🔹 **Audit Trail**
- elaborated_by (e.g. 'Pablo Emilio Ríos Machado (Jun 9 2025 3:41PM)')
- programmed_by
- approved_by

🔹 **Cost Allocation**
Return as array of objects:
"cost_allocation": [
  {"account": "143 PISCINAS", "value": 132744.15},
  {"account": "170 COMUNAL", "value": 142860.45}
]

📌 Format:
Return a **single valid JSON** object with all fields. Don't include extra text or comments.

OCR Text:
${ocrText}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert document parser. Extract structured data from a scanned Spanish purchase order PDF. Output clean JSON, formatted for database ingestion. Do not return nulls; instead return empty strings or default values where applicable. All fields must be present."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.0,
      max_tokens: 2000
    });

    const extractedData = JSON.parse(response.choices[0].message.content || '{}');

    // Ensure items array is always present and properly formatted
    let items = [];
    if (Array.isArray(extractedData.items)) {
      items = extractedData.items;
    } else if (Array.isArray(extractedData.lineItems)) {
      items = extractedData.lineItems;
    } else {
      // Create a default item if none found
      items = [{
        description: "Item from purchase order",
        quantity: "1",
        unitPrice: extractedData.total_amount || extractedData.totalAmount || "0",
        totalPrice: extractedData.total_amount || extractedData.totalAmount || "0"
      }];
    }

    // Map the extracted data to the expected format
    return {
      poId: extractedData.po_number || extractedData.poId || null,
      vendorName: extractedData.vendor_company_name || extractedData.vendorName || null,
      issueDate: extractedData.invoice_date || extractedData.issueDate || null,
      expectedDeliveryDate: extractedData.remission_date || extractedData.expectedDeliveryDate || null,
      totalAmount: extractedData.total_amount || extractedData.totalAmount || null,
      currency: extractedData.currency || "COP",
      projectId: extractedData.project_name || extractedData.projectId || null,
      buyerName: extractedData.buyer_company_name || extractedData.buyerName || null,
      buyerAddress: extractedData.buyer_address || extractedData.buyerAddress || null,
      vendorAddress: extractedData.vendor_address || extractedData.vendorAddress || null,
      terms: extractedData.observations_oc || extractedData.terms || null,
      lineItems: items,
      confidenceScore: extractedData.confidenceScore || "0.8",
    };
  } catch (error: any) {
    console.error("AI PO extraction failed:", error);
    throw new Error(`AI purchase order extraction failed: ${error?.message || 'Unknown error'}`);
  }
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
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
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