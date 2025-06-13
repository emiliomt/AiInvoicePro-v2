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
  lineItems: Array<{
    description: string;
    quantity: string;
    unitPrice: string;
    totalPrice: string;
  }>;
  confidenceScore: string;
}

export async function extractInvoiceData(ocrText: string): Promise<ExtractedInvoiceData> {
  try {
    const prompt = `Extract structured data from this invoice OCR text. The invoice may be in Spanish or English. Respond with JSON in the exact format specified:

OCR Text:
${ocrText}

Extract the following information and return as JSON:
{
  "vendorName": "string or null",
  "invoiceNumber": "string or null", 
  "invoiceDate": "YYYY-MM-DD or null",
  "dueDate": "YYYY-MM-DD or null",
  "totalAmount": "decimal string or null",
  "taxAmount": "decimal string or null",
  "subtotal": "decimal string or null",
  "currency": "string (default USD)",
  "taxId": "string or null",
  "companyName": "string or null",
  "concept": "string or null",
  "projectName": "string or null",
  "lineItems": [
    {
      "description": "string",
      "quantity": "decimal string",
      "unitPrice": "decimal string", 
      "totalPrice": "decimal string"
    }
  ],
  "confidenceScore": "decimal string 0-1"
}

Field Mapping (English/Spanish):
- vendorName: Look for "Vendor", "Supplier", "From" OR "Proveedor", "De", "Empresa"
- invoiceNumber: Look for "Invoice Number", "Invoice #" OR "Número de Factura", "Factura No.", "Orden de Compra"
- invoiceDate: Look for "Invoice Date", "Date" OR "Fecha de Emisión", "Fecha de Factura", "Fecha"
- dueDate: Look for "Due Date", "Payment Due" OR "Fecha de Vencimiento", "Vence", "Fecha Límite"
- totalAmount: Look for "Total", "Amount Due", "Total Amount" OR "Valor de Venta", "Total", "Importe Total"
- taxAmount: Look for "Tax", "VAT", "Sales Tax" OR "Valor Impto", "Valor de Impuesto", "IVA", "Impuesto"
- taxId: Look for "Tax ID", "VAT Number" OR "NIT" (for vendor), "No." (for buyer), "RUT", "RFC"
- companyName: Look for "Bill To", "Customer", "Client" OR "Razón Social", "Cliente", "Empresa Cliente"
- concept: Look for "Description", "Services", "Purpose" OR "Descripción", "Concepto", "Servicios"
- projectName: Look for "Project", "Project Name" OR "Proyecto", "Nombre del Proyecto"
- lineItems descriptions: Look under "Items", "Products", "Services" OR "Artículos", "Productos", "Descripción"

Rules:
- Extract actual values from the text, don't invent data
- Use null if information is not found
- Convert dates to YYYY-MM-DD format
- Extract amounts as decimal strings without currency symbols
- Handle both Spanish and English field labels
- Provide confidence score based on text clarity and completeness`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are an expert invoice data extraction system. Extract structured data from OCR text and respond only with valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
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
      lineItems: Array.isArray(extractedData.lineItems) ? extractedData.lineItems : [],
      confidenceScore: extractedData.confidenceScore || "0.0",
    };
  } catch (error: any) {
    console.error("AI extraction failed:", error);
    throw new Error(`AI data extraction failed: ${error?.message || 'Unknown error'}`);
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
