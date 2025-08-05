import { XmlInvoiceParser } from './xmlInvoiceParser';
import { storage } from '../storage';
import { getProgressTracker } from './progressTracker';
import { ocrService } from './ocrService';
import { OpenAI } from 'openai';

interface XmlProcessingRequest {
  xmlContent: string;
  userId: string;
  taskId?: string;
  fileName?: string;
}

interface XmlProcessingResult {
  success: boolean;
  invoiceId?: number;
  data?: any;
  error?: string;
  processingMetadata: {
    extractionMethod: 'xml_parser' | 'ai_extraction';
    processingTime: number;
    xmlProcessed: boolean;
    validationStatus: 'validated' | 'pending' | 'rejected';
    confidenceScore: number;
  };
}

export class XmlProcessingService {
  private static openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  /**
   * Process XML invoice with enhanced parsing and AI fallback
   */
  static async processXmlInvoice(request: XmlProcessingRequest): Promise<XmlProcessingResult> {
    const startTime = Date.now();
    const { xmlContent, userId, taskId, fileName } = request;

    try {
      console.log('🚀 [XML_PROCESSING] Starting XML invoice processing...');
      
      // Send progress update if taskId provided
      if (taskId) {
        progressTracker.sendProgress(userId, {
          taskId: parseInt(taskId),
          step: 1,
          totalSteps: 5,
          status: 'processing',
          message: 'Starting XML parsing...',
          timestamp: new Date()
        });
      }

      // Step 1: Primary XML parsing
      console.log('📄 [XML_PROCESSING] Attempting XML parsing...');
      const xmlResult = await XmlInvoiceParser.parseXmlInvoice(xmlContent);

      let finalResult: XmlProcessingResult;

      if (xmlResult.success && xmlResult.data) {
        console.log('✅ [XML_PROCESSING] XML parsing successful');
        
        if (taskId) {
          progressTracker.sendProgress(userId, {
            taskId: parseInt(taskId),
            step: 3,
            totalSteps: 5,
            status: 'processing',
            message: 'XML parsing completed, storing invoice...',
            timestamp: new Date()
          });
        }

        // Store the invoice in database
        const invoiceId = await this.storeInvoiceData(xmlResult.data, userId, fileName);
        
        finalResult = {
          success: true,
          invoiceId,
          data: xmlResult.data,
          processingMetadata: {
            extractionMethod: 'xml_parser',
            processingTime: Date.now() - startTime,
            xmlProcessed: true,
            validationStatus: xmlResult.validationStatus,
            confidenceScore: xmlResult.confidenceScore
          }
        };

      } else {
        console.log('⚠️ [XML_PROCESSING] XML parsing failed, attempting AI fallback...');
        
        if (taskId) {
          progressTracker.sendProgress(userId, {
            taskId: parseInt(taskId),
            step: 2,
            totalSteps: 5,
            status: 'processing',
            message: 'XML parsing failed, using AI extraction...',
            timestamp: new Date()
          });
        }

        // Step 2: AI extraction fallback
        const aiResult = await this.extractWithAI(xmlContent);
        
        if (aiResult.success) {
          const invoiceId = await this.storeInvoiceData(aiResult.data, userId, fileName);
          
          finalResult = {
            success: true,
            invoiceId,
            data: aiResult.data,
            processingMetadata: {
              extractionMethod: 'ai_extraction',
              processingTime: Date.now() - startTime,
              xmlProcessed: false,
              validationStatus: 'pending',
              confidenceScore: 0.85
            }
          };
        } else {
          finalResult = {
            success: false,
            error: `Both XML parsing and AI extraction failed: ${xmlResult.error}`,
            processingMetadata: {
              extractionMethod: 'xml_parser',
              processingTime: Date.now() - startTime,
              xmlProcessed: false,
              validationStatus: 'rejected',
              confidenceScore: 0
            }
          };
        }
      }

      // Final progress update
      if (taskId) {
        progressTracker.sendProgress(userId, {
          taskId: parseInt(taskId),
          step: 5,
          totalSteps: 5,
          status: finalResult.success ? 'completed' : 'failed',
          message: finalResult.success ? 'Invoice processing completed' : 'Processing failed',
          timestamp: new Date(),
          data: finalResult.success ? { invoiceId: finalResult.invoiceId } : { error: finalResult.error }
        });
      }

      console.log(`✅ [XML_PROCESSING] Processing completed in ${finalResult.processingMetadata.processingTime}ms`);
      return finalResult;

    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      console.error('❌ [XML_PROCESSING] Processing failed:', error.message);

      if (taskId) {
        progressTracker.sendProgress(userId, {
          taskId: parseInt(taskId),
          step: 5,
          totalSteps: 5,
          status: 'failed',
          message: `Processing failed: ${error.message}`,
          timestamp: new Date()
        });
      }

      return {
        success: false,
        error: error.message,
        processingMetadata: {
          extractionMethod: 'xml_parser',
          processingTime,
          xmlProcessed: false,
          validationStatus: 'rejected',
          confidenceScore: 0
        }
      };
    }
  }

  /**
   * AI extraction fallback using OpenAI GPT-4
   */
  private static async extractWithAI(xmlContent: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      console.log('🤖 [XML_PROCESSING] Starting AI extraction with OpenAI...');

      const prompt = `Extract invoice data from this XML/text content and return as valid JSON with these exact fields:
{
  "vendorName": "string",
  "invoiceNumber": "string", 
  "invoiceDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD",
  "totalAmount": number,
  "taxAmount": number,
  "subtotal": number,
  "currency": "string (default: COP)",
  "taxId": "string (NIT format)",
  "buyerTaxId": "string",
  "companyName": "string",
  "projectName": "string",
  "projectAddress": "string",
  "lineItems": [
    {
      "description": "string",
      "quantity": number,
      "unitPrice": number,
      "totalPrice": number
    }
  ]
}

XML/Text content: ${xmlContent.substring(0, 4000)}...`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert at extracting structured invoice data from XML documents. Return only valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.1
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      // Clean and parse JSON response
      let cleanContent = content.trim();
      if (cleanContent.startsWith("```json")) {
        cleanContent = cleanContent.replace("```json", "").replace("```", "").trim();
      }

      const extractedData = JSON.parse(cleanContent);
      console.log('✅ [XML_PROCESSING] AI extraction successful');

      return { success: true, data: extractedData };

    } catch (error: any) {
      console.error('❌ [XML_PROCESSING] AI extraction failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Store extracted invoice data to database
   */
  private static async storeInvoiceData(data: any, userId: string, fileName?: string): Promise<number> {
    console.log('💾 [XML_PROCESSING] Storing invoice data to database...');

    const invoiceData = {
      userId,
      fileName: fileName || 'xml_invoice.xml',
      companyId: data.companyName || 'Unknown',
      vendorName: data.vendorName,
      invoiceNumber: data.invoiceNumber,
      invoiceDate: new Date(data.invoiceDate),
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      totalAmount: data.totalAmount,
      taxAmount: data.taxAmount || 0,
      subtotal: data.subtotal || data.totalAmount,
      currency: data.currency || 'COP',
      status: 'pending_approval',
      extractedData: JSON.stringify(data),
      originalFileName: fileName,
      processedAt: new Date(),
      taxId: data.taxId,
      projectName: data.projectName,
      projectAddress: data.projectAddress
    };

    const invoice = await storage.createInvoice(invoiceData);
    console.log(`✅ [XML_PROCESSING] Invoice stored with ID: ${invoice.id}`);

    // Store line items if present
    if (data.lineItems && data.lineItems.length > 0) {
      for (const item of data.lineItems) {
        await storage.createLineItem({
          invoiceId: invoice.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice
        });
      }
      console.log(`✅ [XML_PROCESSING] Stored ${data.lineItems.length} line items`);
    }

    return invoice.id;
  }

  /**
   * Batch process multiple XML files
   */
  static async batchProcessXmlFiles(
    files: Array<{ content: string; fileName: string }>,
    userId: string,
    taskId: string
  ): Promise<{ processed: number; failed: number; results: any[] }> {
    const results = [];
    let processed = 0;
    let failed = 0;

    console.log(`🔄 [XML_PROCESSING] Starting batch processing of ${files.length} files...`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      progressTracker.sendProgress(userId, {
        taskId: parseInt(taskId),
        step: i + 1,
        totalSteps: files.length,
        status: 'processing',
        message: `Processing ${file.fileName}...`,
        timestamp: new Date()
      });

      try {
        const result = await this.processXmlInvoice({
          xmlContent: file.content,
          userId,
          fileName: file.fileName
        });

        if (result.success) {
          processed++;
        } else {
          failed++;
        }

        results.push({
          fileName: file.fileName,
          success: result.success,
          invoiceId: result.invoiceId,
          error: result.error
        });

      } catch (error: any) {
        failed++;
        results.push({
          fileName: file.fileName,
          success: false,
          error: error.message
        });
      }
    }

    progressTracker.sendProgress(userId, {
      taskId: parseInt(taskId),
      step: files.length,
      totalSteps: files.length,
      status: 'completed',
      message: `Batch processing completed: ${processed} successful, ${failed} failed`,
      timestamp: new Date(),
      data: { processed, failed, total: files.length }
    });

    console.log(`✅ [XML_PROCESSING] Batch processing completed: ${processed}/${files.length} successful`);

    return { processed, failed, results };
  }
}

// Export singleton
export const xmlProcessingService = new XmlProcessingService();