// Enhanced AI Service - Replace your server/services/aiService.ts with this
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || '',
});

// Cache for storing extraction results to avoid re-processing
const extractionCache = new Map<string, any>();

// Enhanced method to clear the extraction cache
export function clearCache(): void {
  extractionCache.clear();
  console.log('✅ AI extraction cache cleared');
}

// Get cache size for monitoring
export function getCacheSize(): number {
  return extractionCache.size;
}

// Interface for extracted invoice data (keep your existing structure)
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
  }>;
  confidenceScore: string;
}

// ENHANCED MAIN EXTRACTION FUNCTION - Fixes JSON parsing errors
export async function extractInvoiceData(ocrText: string, applyLearning: boolean = true): Promise<ExtractedInvoiceData> {
  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`🤖 AI extraction attempt ${attempt}/${MAX_RETRIES} for ${ocrText.length} chars`);

      // Input validation
      if (!ocrText || ocrText.trim().length < 10) {
        throw new Error('Insufficient OCR text for AI extraction');
      }

      // API key validation
      if (!process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY_ENV_VAR) {
        throw new Error('OpenAI API key not configured');
      }

      // Check cache first for performance
      const cacheKey = ocrText.substring(0, 500);
      if (extractionCache.has(cacheKey)) {
        console.log('✅ Using cached extraction result');
        return extractionCache.get(cacheKey)!;
      }

      // Detect content type and prepare processing
      const isXML = ocrText.includes('<?xml') || ocrText.includes('<Invoice') || ocrText.includes('<cbc:');
      const contentToProcess = isXML ? ocrText.substring(0, 8000) : ocrText.substring(0, 4000);

      console.log(`📄 Processing ${isXML ? 'XML' : 'OCR'} content: ${contentToProcess.length} characters`);

      // Enhanced system prompt for better JSON responses
      const systemPrompt = `You are an expert invoice data extraction system. 
      Extract structured data from ${isXML ? 'XML invoice content' : 'OCR text'} and respond ONLY with valid JSON.

      CRITICAL REQUIREMENTS:
      - Your response must be valid JSON without markdown formatting, explanations, or additional text
      - Never include \`\`\`json or \`\`\` in your response
      - Return exactly the JSON structure specified below

      Required JSON structure:
      {
        "vendorName": "string or null",
        "invoiceNumber": "string or null", 
        "invoiceDate": "YYYY-MM-DD or null",
        "dueDate": "YYYY-MM-DD or null",
        "totalAmount": "decimal string or null",
        "taxAmount": "decimal string or null",
        "subtotal": "decimal string or null",
        "currency": "string (default COP)",
        "taxId": "string or null",
        "companyName": "string or null",
        "concept": "string or null",
        "projectName": "string or null",
        "vendorAddress": "string or null",
        "buyerTaxId": "string or null",
        "buyerAddress": "string or null",
        "descriptionSummary": "string or null",
        "projectAddress": "string or null",
        "projectCity": "string or null",
        "notes": "string or null",
        "lineItems": [],
        "confidenceScore": "decimal string between 0.0 and 1.0"
      }

      Extraction rules:
      - Extract actual values from the document
      - Return null for missing fields (never empty strings or "N/A")
      - Convert dates to YYYY-MM-DD format
      - Extract amounts as decimal strings without currency symbols or commas
      - Default currency to "COP" for Colombian invoices
      - Calculate confidenceScore based on data clarity (0.0 = low, 1.0 = high)
      - For XML: Parse XML tags carefully and extract clean values
      - For OCR: Handle both Spanish and English field labels

      Document content:
      ${contentToProcess}`;

      // Make API call with enhanced error handling and timeout
      console.log('🚀 Sending request to OpenAI...');

      const response = await Promise.race([
        openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are an expert invoice data extraction system. Respond only with valid JSON. Never include markdown formatting, explanations, or additional text outside the JSON structure."
            },
            {
              role: "user",
              content: systemPrompt
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.0,
          max_tokens: 1500
        }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('OpenAI API timeout after 25 seconds')), 25000)
        )
      ]);

      console.log('✅ Received response from OpenAI');

      const responseContent = response.choices[0]?.message?.content;

      if (!responseContent || responseContent.trim().length === 0) {
        throw new Error('Empty response from OpenAI API');
      }

      console.log('📝 Raw response length:', responseContent.length);
      console.log('📝 Response preview:', responseContent.substring(0, 100) + '...');

      // ENHANCED JSON PARSING - This fixes the "JSON.parse: unexpected character" error
      let extractedData: any;

      try {
        // Strategy 1: Direct JSON parsing
        extractedData = JSON.parse(responseContent);
        console.log('✅ Direct JSON parsing successful');

      } catch (directParseError: any) {
        console.log('⚠️ Direct JSON parse failed, trying cleanup strategies...');

        try {
          // Strategy 2: Remove common markdown artifacts and whitespace
          const cleaned = responseContent
            .replace(/```json\s*|\s*```/g, '')
            .replace(/```\s*|\s*```/g, '')
            .replace(/^[^{]*({.*})[^}]*$/gs, '$1')
            .trim();

          extractedData = JSON.parse(cleaned);
          console.log('✅ Cleanup parsing successful');

        } catch (cleanupParseError: any) {
          console.log('⚠️ Cleanup parse failed, trying JSON extraction...');

          try {
            // Strategy 3: Extract JSON object from mixed content
            const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
              throw new Error('No JSON object found in response');
            }

            extractedData = JSON.parse(jsonMatch[0]);
            console.log('✅ JSON extraction successful');

          } catch (extractionError: any) {
            // Strategy 4: Try to find the first { and last } and extract that
            try {
              const firstBrace = responseContent.indexOf('{');
              const lastBrace = responseContent.lastIndexOf('}');

              if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                const jsonString = responseContent.substring(firstBrace, lastBrace + 1);
                extractedData = JSON.parse(jsonString);
                console.log('✅ Brace extraction successful');
              } else {
                throw new Error('Could not locate JSON boundaries');
              }

            } catch (braceError: any) {
              console.error('❌ All JSON parsing strategies failed:', {
                original: directParseError.message,
                cleanup: cleanupParseError.message,
                extraction: extractionError.message,
                brace: braceError.message,
                responsePreview: responseContent.substring(0, 200)
              });

              throw new Error(`Invalid JSON response from AI service (attempt ${attempt}): Multiple parsing strategies failed. Response preview: ${responseContent.substring(0, 100)}`);
            }
          }
        }
      }

      // Validate extracted data structure
      if (typeof extractedData !== 'object' || extractedData === null) {
        throw new Error('AI response is not a valid object');
      }

      console.log('✅ JSON parsing successful, validating and cleaning data...');

      // Apply comprehensive data validation and cleaning (using your existing validation functions)
      const cleanedData: ExtractedInvoiceData = {
        vendorName: validateString(extractedData.vendorName),
        invoiceNumber: validateString(extractedData.invoiceNumber),
        invoiceDate: validateDate(extractedData.invoiceDate),
        dueDate: validateDate(extractedData.dueDate),
        totalAmount: validateAmount(extractedData.totalAmount),
        taxAmount: validateAmount(extractedData.taxAmount),
        subtotal: validateAmount(extractedData.subtotal),
        currency: extractedData.currency || "COP",
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
        confidenceScore: validateConfidenceScore(extractedData.confidenceScore),
        lineItems: Array.isArray(extractedData.lineItems) ? extractedData.lineItems : []
      };

      // Essential data validation
      if (!cleanedData.vendorName && !cleanedData.totalAmount && !cleanedData.invoiceNumber) {
        throw new Error('AI failed to extract essential invoice data (vendor, amount, or invoice number)');
      }

      // Special handling for XML files with missing amounts (keep your existing logic)
      if (isXML && (!cleanedData.totalAmount || cleanedData.totalAmount === "0.00")) {
        console.log('🔧 XML file detected with missing amounts, attempting direct XML parsing...');
        try {
          const directAmounts = await extractAmountsDirectlyFromXML(ocrText);
          if (directAmounts.totalAmount) {
            cleanedData.totalAmount = directAmounts.totalAmount;
            cleanedData.taxAmount = directAmounts.taxAmount || cleanedData.taxAmount;
            cleanedData.subtotal = directAmounts.subtotal || cleanedData.subtotal;
            cleanedData.currency = directAmounts.currency || cleanedData.currency;
            console.log('✅ Direct XML parsing found amounts:', directAmounts);
          }
        } catch (xmlError: any) {
          console.warn('⚠️ Direct XML parsing failed:', xmlError?.message || xmlError);
        }
      }

      // Cache successful result (with size management)
      if (extractionCache.size > 100) {
        const firstKey = extractionCache.keys().next().value;
        extractionCache.delete(firstKey);
      }
      extractionCache.set(cacheKey, cleanedData);

      console.log('✅ AI extraction completed successfully:', {
        vendorName: cleanedData.vendorName,
        invoiceNumber: cleanedData.invoiceNumber,
        totalAmount: cleanedData.totalAmount,
        confidence: cleanedData.confidenceScore,
        attempt: attempt
      });

      return cleanedData;

    } catch (error: any) {
      console.error(`❌ AI extraction attempt ${attempt} failed:`, error.message);
      lastError = error;

      // Don't retry for certain types of errors
      if (error.message?.includes('API key') || 
          error.message?.includes('quota') ||
          error.message?.includes('Insufficient OCR text') ||
          error.message?.includes('not configured')) {
        break;
      }

      // Exponential backoff for retries
      if (attempt < MAX_RETRIES) {
        const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`⏳ Waiting ${waitTime}ms before retry ${attempt + 1}...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // All retries failed - provide detailed error information
  console.error('❌ All AI extraction attempts failed');

  if (lastError?.message?.includes('timeout')) {
    throw new Error('AI service timeout - the service may be overloaded. Please try again in a few moments.');
  } else if (lastError?.message?.includes('quota')) {
    throw new Error('OpenAI quota exceeded - please check your API usage limits and try again later.');
  } else if (lastError?.message?.includes('JSON') || lastError?.message?.includes('parsing')) {
    throw new Error('AI returned invalid JSON response - this is usually a temporary issue. Please try processing again.');
  } else if (lastError?.message?.includes('essential invoice data')) {
    throw new Error('Could not extract essential invoice data - the document may be corrupted or unreadable.');
  } else {
    throw new Error(`AI data extraction failed after ${MAX_RETRIES} attempts: ${lastError?.message || 'Unknown error'}`);
  }
}

// Helper validation functions (enhanced versions of your existing functions)
function validateString(value: any): string | null {
  if (typeof value === 'string' && value.trim().length > 0 && value.trim() !== 'null' && value.trim() !== 'N/A') {
    return value.trim();
  }
  return null;
}

function validateAmount(value: any): string | null {
  if (typeof value === 'string' || typeof value === 'number') {
    const cleanValue = String(value).replace(/[,$\s]/g, '');
    const numValue = parseFloat(cleanValue);
    if (!isNaN(numValue) && numValue >= 0) {
      return numValue.toFixed(2);
    }
  }
  return null;
}

function validateDate(value: any): string | null {
  if (typeof value === 'string' && value.trim() !== 'null' && value.trim() !== 'N/A') {
    const date = new Date(value);
    if (!isNaN(date.getTime()) && date.getFullYear() > 1900 && date.getFullYear() < 2100) {
      return date.toISOString().split('T')[0];
    }
  }
  return null;
}

function validateTaxId(value: any): string | null {
  if (typeof value === 'string' && value.trim().length > 0 && value.trim() !== 'null' && value.trim() !== 'N/A') {
    return value.trim().replace(/[^\d-]/g, '');
  }
  return null;
}

function validateConfidenceScore(value: any): string {
  if (typeof value === 'string' || typeof value === 'number') {
    const score = parseFloat(String(value));
    if (!isNaN(score) && score >= 0 && score <= 1) {
      return score.toFixed(2);
    }
  }
  return "0.6"; // Default confidence
}

// Keep your existing XML parsing function (enhanced with better error handling)
async function extractAmountsDirectlyFromXML(xmlContent: string): Promise<{
  totalAmount: string | null;
  taxAmount: string | null;
  subtotal: string | null;
  currency: string;
}> {
  try {
    console.log('🔧 Attempting direct XML amount extraction...');

    // Use regex to find amount fields with currency attributes
    const amountPatterns = [
      /<cbc:TaxInclusiveAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:TaxInclusiveAmount>/gi,
      /<cbc:PayableAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:PayableAmount>/gi,
      /<cbc:TaxExclusiveAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:TaxExclusiveAmount>/gi,
      /<cbc:TaxAmount[^>]*currencyID="([^"]*)"[^>]*>([\d.,]+)<\/cbc:TaxAmount>/gi
    ];

    let totalAmount: string | null = null;
    let taxAmount: string | null = null;
    let subtotal: string | null = null;
    let currency = "COP";

    // Extract amounts using patterns
    for (const pattern of amountPatterns) {
      let match;
      while ((match = pattern.exec(xmlContent)) !== null) {
        currency = match[1];
        const amount = validateAmount(match[2]);

        if (pattern.source.includes('TaxInclusiveAmount') || pattern.source.includes('PayableAmount')) {
          totalAmount = amount;
        } else if (pattern.source.includes('TaxExclusiveAmount')) {
          subtotal = amount;
        } else if (pattern.source.includes('TaxAmount')) {
          taxAmount = amount;
        }
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

    console.log('✅ Direct XML extraction results:', { totalAmount, taxAmount, subtotal, currency });
    return { totalAmount, taxAmount, subtotal, currency };

  } catch (error) {
    console.error('❌ Direct XML parsing failed:', error);
    return { totalAmount: null, taxAmount: null, subtotal: null, currency: "COP" };
  }
}

// Keep your existing simplified extraction function (enhanced)
async function attemptSimplifiedExtraction(ocrText: string): Promise<ExtractedInvoiceData> {
  console.log('🔄 Attempting simplified extraction due to low completeness...');

  try {
    const simplePrompt = `Extract only basic invoice information from this text. Return valid JSON only:
    {
      "vendorName": "vendor name or null",
      "invoiceNumber": "invoice number or null", 
      "totalAmount": "total amount or null",
      "currency": "currency or COP",
      "confidenceScore": "0.4"
    }

    Text: ${ocrText.substring(0, 2000)}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Extract basic invoice data and return only valid JSON." },
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
      invoiceDate: null,
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
      confidenceScore: "0.4"
    };
  } catch (error) {
    console.error('❌ Simplified extraction also failed:', error);
    throw new Error('Both primary and simplified AI extraction failed');
  }
}

// Keep your existing functions for compatibility
export async function extractPurchaseOrderData(ocrText: string): Promise<any> {
  // Keep your existing implementation
  console.log('Using existing PO extraction...');
  return {};
}

export async function findBestProjectMatch(projectName: string, availableProjects: any[]): Promise<any> {
  // Keep your existing implementation  
  console.log('Using existing project matching...');
  return null;
}

// Helper function to extract city from address
function extractCity(address: string): string {
  if (!address) return '';
  // Extract city from Colombian address format "CITY, DEPARTMENT, POSTAL"
  const parts = address.split(',');
  return parts.length > 0 ? parts[0].trim() : '';
}

// POST-EXTRACTION WORKFLOW METHODS

// Step 1: Classify line items using AI
export async function classifyLineItems(extractedData: any): Promise<any> {
  try {
    console.log('🏷️ Classifying invoice line items...');
    
    if (!extractedData || !extractedData.lineItems || extractedData.lineItems.length === 0) {
      return {
        classifiedItems: [],
        categories: [],
        confidenceScore: 0.8
      };
    }

    const systemPrompt = `You are an expert at categorizing invoice line items for business expense tracking.
    Classify each line item into appropriate business categories and respond with valid JSON only.

    Categories to use:
    - Office Supplies
    - Travel & Transportation
    - Equipment & Hardware
    - Software & Licenses
    - Professional Services
    - Marketing & Advertising
    - Utilities & Communications
    - Raw Materials
    - Food & Beverages
    - Other Expenses

    Required JSON structure:
    {
      "classifiedItems": [
        {
          "description": "original description",
          "category": "category name",
          "subcategory": "optional subcategory",
          "quantity": "quantity value",
          "unitPrice": "unit price",
          "totalPrice": "total price",
          "confidence": "0.0-1.0"
        }
      ],
      "summary": {
        "totalCategories": "number",
        "primaryCategory": "most common category",
        "overallConfidence": "0.0-1.0"
      }
    }`;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Classify these line items: ${JSON.stringify(extractedData.lineItems)}` }
      ],
      temperature: 0.1,
      max_tokens: 2000
    });

    const result = JSON.parse(response.choices[0].message.content?.trim() || '{}');
    console.log('✅ Line items classified successfully');
    return result;

  } catch (error) {
    console.error('❌ Line item classification failed:', error);
    return {
      classifiedItems: extractedData.lineItems || [],
      summary: { error: 'Classification failed', overallConfidence: 0.3 }
    };
  }
}

// Step 2A: Determine if invoice is petty cash
export async function classifyPettyCash(invoice: any): Promise<boolean> {
  try {
    console.log('💰 Checking petty cash classification...');
    
    const totalAmount = parseFloat(invoice.totalAmount || '0');
    const vendorName = invoice.vendorName || '';
    const description = invoice.extractedData?.descriptionSummary || '';

    // Simple rule-based petty cash classification
    const isPettyCashAmount = totalAmount <= 200; // Under $200 USD equivalent
    const isPettyCashVendor = /coffee|restaurant|taxi|uber|parking|store|market/i.test(vendorName);
    const isPettyCashDescription = /office supplies|food|transportation|parking|small purchase/i.test(description);

    const pettyCashScore = (isPettyCashAmount ? 0.4 : 0) + 
                          (isPettyCashVendor ? 0.3 : 0) + 
                          (isPettyCashDescription ? 0.3 : 0);

    const isPettyCash = pettyCashScore >= 0.5;
    
    console.log(`✅ Petty cash classification: ${isPettyCash} (score: ${pettyCashScore})`);
    return isPettyCash;

  } catch (error) {
    console.error('❌ Petty cash classification failed:', error);
    return false;
  }
}

// Step 2B: Match invoice to projects using enhanced ProjectMatcherService
export async function matchToProject(invoice: any): Promise<any> {
  try {
    console.log(`🎯 Matching invoice ${invoice.id} (${invoice.fileName || 'unknown'}) to projects...`);
    
    const { storage } = await import('../storage');
    const projects = await storage.getProjects();
    
    if (!projects || projects.length === 0) {
      console.log('No projects available for matching');
      return {
        projectId: null,
        projectName: null,
        matchConfidence: 0.0,
        matchReasons: [],
        suggestedProjects: []
      };
    }

    // Use the enhanced ProjectMatcherService
    const { projectMatcher } = await import('../projectMatcher');
    const matchResults = await projectMatcher.matchInvoiceWithProjects(invoice, projects);
    
    if (matchResults.length === 0) {
      console.log('No suitable project matches found above 50% threshold');
      return {
        projectId: null,
        projectName: null,
        matchConfidence: 0.0,
        matchReasons: [],
        suggestedProjects: []
      };
    }

    // Get the best match
    const bestMatch = matchResults[0];
    console.log(`✅ Found project match: ${bestMatch.project.name} (${bestMatch.matchScore}% confidence)`);
    
    return {
      projectId: bestMatch.project.projectId,
      projectName: bestMatch.project.name,
      matchConfidence: bestMatch.matchScore / 100,
      matchReasons: bestMatch.matchDetails.reasons,
      suggestedProjects: matchResults.slice(0, 3).map(m => m.project) // Return top 3 suggestions
    };
    
  } catch (error) {
    console.error('❌ Project matching failed:', error);
    return {
      projectId: null,
      projectName: null,
      matchConfidence: 0.0,
      matchReasons: [`Error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      suggestedProjects: []
    };
  }
}

// Helper function for string similarity calculation
function calculateStringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 100;
  
  // Simple fuzzy matching using character overlap
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 100;
  
  const matches = shorter.split('').filter(char => longer.includes(char)).length;
  return Math.round((matches / longer.length) * 100);
}