import Tesseract, { createWorker } from 'tesseract.js';
import { fromBuffer } from 'pdf2pic';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';
import { TextItem } from 'pdfjs-dist/types/src/display/api';
import { createWorker } from 'tesseract.js';
import path from 'path';
import fs from 'fs';

// Define interface for pdf2pic result
interface PDFConvertResult {
  path?: string;
  name?: string;
  size?: number;
}

// Helper function to detect file type from buffer
function detectFileType(buffer: Buffer): string {
  if (buffer.slice(0, 4).toString() === '%PDF') {
    return 'PDF';
  }

  // Check for XML files
  const textContent = buffer.toString('utf8', 0, Math.min(buffer.length, 1000));
  if (textContent.trim().startsWith('<?xml') || textContent.includes('<Invoice') || textContent.includes('<Factura')) {
    return 'XML';
  }

  const magicBytes = buffer.slice(0, 8);
  const isPNG = magicBytes.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47]));
  const isJPEG = magicBytes.slice(0, 3).equals(Buffer.from([0xFF, 0xD8, 0xFF]));

  if (isPNG) return 'PNG';
  if (isJPEG) return 'JPEG';

  return 'Unknown';
}

// Helper function to process XML content
async function processXMLContent(fileBuffer: Buffer, invoiceId: number): Promise<string> {
  try {
    const xmlContent = fileBuffer.toString('utf8');
    console.log(`XML content extracted for invoice ${invoiceId}, length: ${xmlContent.length} characters`);

    // For XML files, we can directly use the content as structured text
    // This is much more reliable than OCR since XML is already structured data
    if (!xmlContent || xmlContent.trim().length < 10) {
      throw new Error('XML file appears to be empty or corrupted');
    }

    return xmlContent;
  } catch (error) {
    console.error(`XML processing failed for invoice ${invoiceId}:`, error);
    throw new Error(`XML processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function processInvoiceOCR(fileBuffer: Buffer, invoiceId: number): Promise<string> {
  try {
    console.log(`Starting OCR processing for invoice ${invoiceId}, buffer size: ${fileBuffer.length} bytes`);

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error('Empty or invalid file buffer');
    }

    const fileType = detectFileType(fileBuffer);
    console.log(`File type detected for invoice ${invoiceId}: ${fileType}`);

    let textContent = '';

    if (fileType === 'PDF') {
      try {
        // Process PDF with OCR directly (convert to image first)
        console.log(`Processing PDF with OCR for invoice ${invoiceId}`);
        textContent = await processImageOCR(fileBuffer, invoiceId);
      } catch (pdfError) {
        console.error(`PDF processing failed for invoice ${invoiceId}:`, pdfError);
        // Try alternative PDF processing
        console.log(`Attempting alternative PDF processing for invoice ${invoiceId}`);
        try {
          textContent = await processPDFAlternative(fileBuffer, invoiceId);
        } catch (altError) {
          throw new Error(`PDF processing failed: ${pdfError instanceof Error ? pdfError.message : 'Unknown error'}`);
        }
      }
    } else if (fileType === 'XML') {
      // Process XML directly - extract text content
      console.log(`Processing XML file for invoice ${invoiceId}`);
      textContent = await processXMLContent(fileBuffer, invoiceId);
    } else {
      // For images, use OCR directly
      console.log(`Processing image with OCR for invoice ${invoiceId}`);
      textContent = await processImageOCR(fileBuffer, invoiceId);
    }

    if (!textContent || textContent.trim().length < 10) {
      console.error(`Insufficient text extracted for invoice ${invoiceId}: "${textContent?.substring(0, 100)}..."`);
      throw new Error('OCR processing completed but extracted insufficient text. The document may be unclear or in an unsupported format.');
    }

    console.log(`OCR processing completed for invoice ${invoiceId}, extracted ${textContent.length} characters`);
    console.log(`Sample text for invoice ${invoiceId}: "${textContent.substring(0, 200)}..."`);
    return textContent;
  } catch (error) {
    console.error(`OCR processing failed for invoice ${invoiceId}:`, error);
    throw new Error(`OCR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Alternative PDF processing method
async function processPDFAlternative(fileBuffer: Buffer, invoiceId: number): Promise<string> {
  try {
    console.log(`Alternative PDF processing for invoice ${invoiceId}`);

    // Try simpler PDF conversion settings
    const convert = fromBuffer(fileBuffer, {
      density: 100,
      saveFilename: `invoice_${invoiceId}_alt`,
      savePath: "/tmp",
      format: "png",
      width: 800,
      height: 800
    });

    const result = await convert(1) as PDFConvertResult;

    if (result && result.path && fs.existsSync(result.path)) {
      const imageBuffer = fs.readFileSync(result.path);

      const { data: { text } } = await Tesseract.recognize(imageBuffer, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log(`Alt OCR Progress for invoice ${invoiceId}: ${Math.round(m.progress * 100)}%`);
          }
        }
      });

      console.log(`OCR completed. Extracted text length: ${text.length}`);

      // Clean and preprocess OCR text for better AI extraction
      const cleanedText = preprocessOCRText(text);
      return cleanedText;
    } else {
      throw new Error(`Alternative PDF conversion failed for invoice ${invoiceId}`);
    }
  } catch (error) {
    console.error(`Alternative PDF processing failed for invoice ${invoiceId}:`, error);
    throw error;
  }
}

// Helper function to process images with OCR
async function processImageOCR(fileBuffer: Buffer, invoiceId: number): Promise<string> {
  const fileType = detectFileType(fileBuffer);

  if (fileType === 'PDF') {
    // Convert PDF to image first
    const convert = fromBuffer(fileBuffer, {
      density: 150,
      saveFilename: `invoice_${invoiceId}_page`,
      savePath: "/tmp",
      format: "png",
      width: 1200,
      height: 1200
    });

    const result = await convert(1) as PDFConvertResult;

    if (result && result.path && fs.existsSync(result.path)) {
      const imageBuffer = fs.readFileSync(result.path);

      const { data: { text } } = await Tesseract.recognize(imageBuffer, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text' && m.progress % 0.1 === 0) {
            console.log(`OCR Progress for invoice ${invoiceId}: ${Math.round(m.progress * 100)}%`);
          }
        },
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
        tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY,
      });

      console.log(`OCR completed. Extracted text length: ${text.length}`);

      // Clean and preprocess OCR text for better AI extraction
      const cleanedText = preprocessOCRText(text);
      return cleanedText;
    } else {
      throw new Error(`PDF conversion failed for invoice ${invoiceId} - no valid image path returned`);
    }
  } else {
    // Process image directly
    const { data: { text } } = await Tesseract.recognize(fileBuffer, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text' && m.progress % 0.1 === 0) {
          console.log(`OCR Progress for invoice ${invoiceId}: ${Math.round(m.progress * 100)}%`);
        }
      },
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
      tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY,
    });

    console.log(`OCR completed. Extracted text length: ${text.length}`);

    // Clean and preprocess OCR text for better AI extraction
    const cleanedText = preprocessOCRText(text);
    return cleanedText;
  }
}

export async function processInvoiceOCRWithConfidence(fileBuffer: Buffer): Promise<{
  text: string;
  confidence: number;
}> {
  try {
    const fileType = detectFileType(fileBuffer);

    if (fileType === 'XML') {
      // XML files have 100% confidence since they're structured data
      const xmlContent = fileBuffer.toString('utf8');
      return {
        text: xmlContent,
        confidence: 1.0, // 100% confidence for XML files
      };
    } else if (fileType === 'PDF') {
      // Convert PDF to images and process with OCR
      const convert = fromBuffer(fileBuffer, {
        density: 300,
        saveFilename: "page",
        savePath: "/tmp",
        format: "png",
        width: 2048,
        height: 2048
      });

      try {
        // Process first page only
        const result = await convert(1) as PDFConvertResult;

        if (result && result.path) {
          // Read the converted image file
          const imageBuffer = fs.readFileSync(result.path);
          const { data } = await Tesseract.recognize(imageBuffer, 'eng');

          // Clean up temporary file
          try {
            fs.unlinkSync(result.path);
          } catch (cleanupError) {
            console.warn(`Failed to cleanup temp file: ${result.path}`);
          }

          return {
            text: data.text,
            confidence: data.confidence / 100, // Convert to 0-1 scale
          };
        } else {
          throw new Error('PDF conversion failed - no image path returned');
        }
      } catch (pdfError: any) {
        console.error('PDF conversion failed:', pdfError);
        throw new Error(`PDF conversion failed: ${pdfError?.message || 'Unknown PDF error'}`);
      }
    } else {
      // Process as image directly
      const { data } = await Tesseract.recognize(fileBuffer, 'eng');

      return {
        text: data.text,
        confidence: data.confidence / 100, // Convert to 0-1 scale
      };
    }
  } catch (error: any) {
    console.error('OCR processing failed:', error);
    throw new Error(`OCR processing failed: ${error?.message || 'Unknown error'}`);
  }
}

// Export a service object for consistent usage
export const ocrService = {
  extractText: async (buffer: Buffer, mimeType: string): Promise<string> => {
    return await processInvoiceOCR(buffer, Date.now());
  },
  extractTextWithConfidence: async (buffer: Buffer): Promise<{ text: string; confidence: number }> => {
    return await processInvoiceOCRWithConfidence(buffer);
  }
};

// Preprocess OCR text to improve AI extraction accuracy
function preprocessOCRText(text: string): string {
  let cleaned = text;

  // Remove excessive whitespace and normalize line breaks
  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.replace(/\n\s*\n/g, '\n');

  // Fix common OCR errors in Spanish/Latin American invoices
  cleaned = cleaned.replace(/\bEmisor\b/gi, 'Emisor');
  cleaned = cleaned.replace(/\bFactura\b/gi, 'Factura');
  cleaned = cleaned.replace(/\bFecha\b/gi, 'Fecha');
  cleaned = cleaned.replace(/\bTotal\b/gi, 'Total');
  cleaned = cleaned.replace(/\bSubtotal\b/gi, 'Subtotal');
  cleaned = cleaned.replace(/\bIVA\b/gi, 'IVA');
  cleaned = cleaned.replace(/\bNIT\b/gi, 'NIT');
  cleaned = cleaned.replace(/\bRFC\b/gi, 'RFC');
  cleaned = cleaned.replace(/\bCUIT\b/gi, 'CUIT');
  cleaned = cleaned.replace(/\bProveedor\b/gi, 'Proveedor');
  cleaned = cleaned.replace(/\bCliente\b/gi, 'Cliente');
  cleaned = cleaned.replace(/\bAdquiriente\b/gi, 'Adquiriente');
  cleaned = cleaned.replace(/\bObra\b/gi, 'Obra');
  cleaned = cleaned.replace(/\bProyecto\b/gi, 'Proyecto');

  // Fix common number formatting issues
  cleaned = cleaned.replace(/([0-9])\.([0-9]{3})/g, '$1$2'); // Remove thousands separators
  cleaned = cleaned.replace(/([0-9]),([0-9]{2})\b/g, '$1.$2'); // Fix decimal separators

  // Fix date formatting
  cleaned = cleaned.replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g, '$3-$2-$1'); // DD/MM/YYYY to YYYY-MM-DD
  cleaned = cleaned.replace(/(\d{1,2})-(\d{1,2})-(\d{4})/g, '$3-$2-$1'); // DD-MM-YYYY to YYYY-MM-DD

  // Add structure markers to help AI identify sections
  cleaned = cleaned.replace(/\bEmisor\b/gi, '\n--- EMISOR ---\nEmisor');
  cleaned = cleaned.replace(/\bAdquiriente\b/gi, '\n--- ADQUIRIENTE ---\nAdquiriente');
  cleaned = cleaned.replace(/\bFactura\s+No?\s*[:.]?\s*(\S+)/gi, '\n--- FACTURA INFO ---\nFactura No: $1');
  cleaned = cleaned.replace(/\bTotal\s*[:.]?\s*(\S+)/gi, '\n--- TOTALES ---\nTotal: $1');

  return cleaned.trim();
}