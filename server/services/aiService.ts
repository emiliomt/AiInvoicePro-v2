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
        description: "Purchase order item",
        quantity: "1",
        unitPrice: (extractedData.total_general || 0).toString(),
        totalPrice: (extractedData.total_general || 0).toString()
      }];
    }

    // Map extracted data to expected format
    return {
      poId: extractedData.orden_compra_no || extractedData.entrada_almacen_no || "",
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