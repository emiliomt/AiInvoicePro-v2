import Tesseract from 'tesseract.js';
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

export async function processInvoiceOCR(fileBuffer: Buffer, invoiceId: number): Promise<string> {
  try {
    console.log(`Starting OCR processing for invoice ${invoiceId}, buffer size: ${fileBuffer.length} bytes`);
    
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error('Empty or invalid file buffer');
    }
    
    // Check if the file is a PDF
    const isPdf = fileBuffer.slice(0, 4).toString() === '%PDF';
    console.log(`File type detected for invoice ${invoiceId}: ${isPdf ? 'PDF' : 'Image'}`);
    
    if (isPdf) {
      console.log(`Converting PDF to image for invoice ${invoiceId}`);
      
      // Convert PDF to images and process with OCR
      let convert;
      try {
        convert = fromBuffer(fileBuffer, {
          density: 200,
          saveFilename: `invoice_${invoiceId}_page`,
          savePath: "/tmp",
          format: "png",
          width: 1600,
          height: 1600
        });
      } catch (conversionSetupError: any) {
        console.error(`PDF conversion setup failed for invoice ${invoiceId}:`, conversionSetupError);
        throw new Error(`PDF conversion setup failed: ${conversionSetupError.message}`);
      }
      
      let fullText = '';
      
      try {
        // Process first page only for now (can be extended for multi-page PDFs)
        console.log(`Converting page 1 of PDF for invoice ${invoiceId}`);
        const result = await convert(1) as PDFConvertResult;
        
        if (result && result.path && fs.existsSync(result.path)) {
          console.log(`PDF converted successfully for invoice ${invoiceId}, running OCR on: ${result.path}`);
          
          // Read the converted image file
          const imageBuffer = fs.readFileSync(result.path);
          console.log(`Image buffer size for invoice ${invoiceId}: ${imageBuffer.length} bytes`);
          
          const { data: { text, confidence } } = await Tesseract.recognize(imageBuffer, 'eng', {
            logger: (m) => {
              if (m.status === 'recognizing text') {
                console.log(`OCR Progress for invoice ${invoiceId}: ${Math.round(m.progress * 100)}%`);
              }
            }
          });
          
          fullText = text;
          console.log(`OCR completed for invoice ${invoiceId}, confidence: ${confidence}%, text length: ${fullText.length}`);
          
          // Clean up temporary file
          try {
            fs.unlinkSync(result.path);
            console.log(`Cleaned up temp file for invoice ${invoiceId}: ${result.path}`);
          } catch (cleanupError) {
            console.warn(`Failed to cleanup temp file for invoice ${invoiceId}: ${result.path}`);
          }
        } else {
          const errorMsg = `PDF conversion failed for invoice ${invoiceId} - no valid image path returned`;
          console.error(errorMsg);
          throw new Error(errorMsg);
        }
      } catch (pdfError: any) {
        console.error(`PDF processing failed for invoice ${invoiceId}:`, pdfError);
        throw new Error(`PDF processing failed: ${pdfError?.message || 'Unknown PDF error'}`);
      }
      
      if (!fullText || fullText.trim().length < 5) {
        throw new Error(`OCR extracted insufficient text from PDF (${fullText.length} characters)`);
      }
      
      console.log(`OCR completed successfully for invoice ${invoiceId}`);
      return fullText;
    } else {
      // Process as image directly
      console.log(`Processing image directly for invoice ${invoiceId}`);
      
      const { data: { text, confidence } } = await Tesseract.recognize(fileBuffer, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress for invoice ${invoiceId}: ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      
      console.log(`OCR completed for invoice ${invoiceId}, confidence: ${confidence}%, text length: ${text.length}`);
      
      if (!text || text.trim().length < 5) {
        throw new Error(`OCR extracted insufficient text from image (${text.length} characters)`);
      }
      
      return text;
    }
  } catch (error: any) {
    console.error(`OCR failed for invoice ${invoiceId}:`, error);
    throw new Error(`OCR processing failed: ${error?.message || 'Unknown error'}`);
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
