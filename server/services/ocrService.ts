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
    console.log(`Starting OCR processing for invoice ${invoiceId}`);
    
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
      
      let fullText = '';
      
      try {
        // Process first page only for now (can be extended for multi-page PDFs)
        const result = await convert(1) as PDFConvertResult;
        
        if (result && result.path) {
          // Read the converted image file
          const imageBuffer = fs.readFileSync(result.path);
          const { data: { text } } = await Tesseract.recognize(imageBuffer, 'eng', {
            logger: m => console.log(`OCR Progress for invoice ${invoiceId}:`, m)
          });
          fullText = text;
          
          // Clean up temporary file
          try {
            fs.unlinkSync(result.path);
          } catch (cleanupError) {
            console.warn(`Failed to cleanup temp file: ${result.path}`);
          }
        } else {
          throw new Error('PDF conversion failed - no image path returned');
        }
      } catch (pdfError: any) {
        console.error(`PDF conversion failed for invoice ${invoiceId}:`, pdfError);
        throw new Error(`PDF conversion failed: ${pdfError?.message || 'Unknown PDF error'}`);
      }
      
      console.log(`OCR completed for invoice ${invoiceId}`);
      return fullText;
    } else {
      // Process as image directly
      const { data: { text } } = await Tesseract.recognize(fileBuffer, 'eng', {
        logger: m => console.log(`OCR Progress for invoice ${invoiceId}:`, m)
      });
      
      console.log(`OCR completed for invoice ${invoiceId}`);
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
      
      // Process first page only
      const result = await convert(1);
      
      if (result.path) {
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
        throw new Error('Failed to convert PDF to image');
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
