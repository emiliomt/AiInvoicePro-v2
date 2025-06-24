import Tesseract, { createWorker } from 'tesseract.js';
import { fromBuffer } from 'pdf2pic';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

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
  
  const magicBytes = buffer.slice(0, 8);
  const isPNG = magicBytes.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47]));
  const isJPEG = magicBytes.slice(0, 3).equals(Buffer.from([0xFF, 0xD8, 0xFF]));
  
  if (isPNG) return 'PNG';
  if (isJPEG) return 'JPEG';
  
  return 'Unknown';
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
        // Try direct text extraction first
        const pdfParse = await import('pdf-parse');
        const pdfData = await pdfParse.default(fileBuffer);
        textContent = pdfData.text;
        console.log(`Direct PDF text extraction for invoice ${invoiceId}, length: ${textContent.length}`);

        if (textContent && textContent.trim().length > 50) {
          return textContent;
        }

        console.log(`Text extraction failed for invoice ${invoiceId}, falling back to OCR`);

        // Fallback to OCR if direct extraction fails
        textContent = await processImageOCR(fileBuffer, invoiceId);
      } catch (pdfError) {
        console.error(`PDF processing failed for invoice ${invoiceId}:`, pdfError);
        throw new Error(`PDF processing failed: ${pdfError instanceof Error ? pdfError.message : 'Unknown error'}`);
      }
    } else {
      // For images, use OCR directly
      textContent = await processImageOCR(fileBuffer, invoiceId);
    }

    if (!textContent || textContent.trim().length < 10) {
      throw new Error('OCR processing completed but extracted insufficient text. The document may be unclear or in an unsupported format.');
    }

    console.log(`OCR processing completed for invoice ${invoiceId}, extracted ${textContent.length} characters`);
    return textContent;
  } catch (error) {
    console.error(`OCR processing failed for invoice ${invoiceId}:`, error);
    throw new Error(`OCR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

      // Clean up temporary file
      try {
        fs.unlinkSync(result.path);
      } catch (cleanupError) {
        console.warn(`Failed to cleanup temp file for invoice ${invoiceId}: ${result.path}`);
      }

      return text;
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

    return text;
  }
}

export async function processInvoiceOCRWithConfidence(fileBuffer: Buffer): Promise<{
  text: string;
  confidence: number;
}> {
  try {
    // Check if the file is a PDF
    const isPdf = fileBuffer.slice(0, 4).toString() === '%PDF';

    if (isPdf) {
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

