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

  // Check for XML files - enhanced to detect AttachedDocument wrappers
  const textContent = buffer.toString('utf8', 0, Math.min(buffer.length, 1000));
  if (textContent.trim().startsWith('<?xml') || 
      textContent.includes('<Invoice') || 
      textContent.includes('<CreditNote') ||
      textContent.includes('<AttachedDocument') ||
      textContent.includes('<Factura')) {
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

// Enhanced image preprocessing for better OCR quality
async function enhanceImageForOCR(imageBuffer: Buffer): Promise<Buffer> {
  try {
    // Apply image enhancements using Sharp for better OCR recognition
    const enhancedImage = await sharp(imageBuffer)
      .resize(2400, 3200, { 
        fit: 'inside',
        withoutEnlargement: false,
        kernel: sharp.kernel.lanczos3
      })
      .normalize() // Normalize contrast
      .modulate({
        brightness: 1.1, // Slightly brighten
        saturation: 0.8  // Reduce saturation to focus on text
      })
      .linear(1.2, -(128 * 1.2) + 128) // Increase contrast manually
      .sharpen(1, 1, 2) // Apply sharpening for crisp text edges
      .gamma(0.9) // Adjust gamma for better text visibility
      .png({ quality: 100, compressionLevel: 0 }) // High quality PNG output
      .toBuffer();

    console.log('Image enhancement completed for better OCR quality');
    return enhancedImage;
  } catch (error) {
    console.warn('Image enhancement failed, using original:', error);
    return imageBuffer;
  }
}

// Helper function to process images with OCR - Enhanced for higher quality
async function processImageOCR(fileBuffer: Buffer, invoiceId: number): Promise<string> {
  const fileType = detectFileType(fileBuffer);

  if (fileType === 'PDF') {
    // Enhanced PDF to image conversion with higher quality settings
    const convert = fromBuffer(fileBuffer, {
      density: 300, // Increased density for better quality
      saveFilename: `invoice_${invoiceId}_page`,
      savePath: "/tmp",
      format: "png",
      width: 2400,  // Higher resolution
      height: 3200, // Higher resolution
      quality: 100  // Maximum quality
    });

    const result = await convert(1) as PDFConvertResult;

    if (result && result.path && fs.existsSync(result.path)) {
      let imageBuffer = fs.readFileSync(result.path);
      
      // Apply image enhancement before OCR
      imageBuffer = await enhanceImageForOCR(imageBuffer);

      // Enhanced Tesseract configuration for better Latin American invoice recognition
      const worker = await createWorker('spa+eng');
      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.AUTO_OSD, // Automatic orientation and script detection
        tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY,
        preserve_interword_spaces: '1',
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ÁÉÍÓÚáéíóúÑñÜü.,;:()-$%/@#& ',
        user_defined_dpi: '300',
        textord_heavy_nr: '1',
        textord_tabfind_find_tables: '1'
      });
      
      const { data: { text } } = await worker.recognize(imageBuffer);
      await worker.terminate();

      // Cleanup temporary file
      try {
        fs.unlinkSync(result.path);
      } catch (cleanupError) {
        console.warn(`Failed to cleanup temp file: ${result.path}`);
      }

      console.log(`Enhanced OCR completed. Extracted text length: ${text.length}`);

      // Enhanced preprocessing for better AI extraction
      const cleanedText = preprocessOCRTextEnhanced(text);
      return cleanedText;
    } else {
      throw new Error(`PDF conversion failed for invoice ${invoiceId} - no valid image path returned`);
    }
  } else {
    // Process image directly with enhancements
    let processBuffer = fileBuffer;
    
    // Apply image enhancement for direct image processing
    processBuffer = await enhanceImageForOCR(fileBuffer);

    // Enhanced Tesseract configuration for images
    const worker = await createWorker('spa+eng');
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.AUTO_OSD,
      tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY,
      preserve_interword_spaces: '1',
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ÁÉÍÓÚáéíóúÑñÜü.,;:()-$%/@#& ',
      user_defined_dpi: '300',
      textord_heavy_nr: '1',
      textord_tabfind_find_tables: '1'
    });
    
    const { data: { text } } = await worker.recognize(processBuffer);
    await worker.terminate();

    console.log(`Enhanced OCR completed. Extracted text length: ${text.length}`);

    // Enhanced preprocessing for better AI extraction
    const cleanedText = preprocessOCRTextEnhanced(text);
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
      // Enhanced PDF to image conversion for better quality
      const convert = fromBuffer(fileBuffer, {
        density: 300,
        saveFilename: "page",
        savePath: "/tmp",
        format: "png",
        width: 2400,  // Higher resolution
        height: 3200, // Higher resolution
        quality: 100
      });

      try {
        // Process first page only
        const result = await convert(1) as PDFConvertResult;

        if (result && result.path) {
          // Read and enhance the converted image file
          let imageBuffer = fs.readFileSync(result.path);
          imageBuffer = await enhanceImageForOCR(imageBuffer);
          
          // Enhanced Tesseract recognition
          const worker = await createWorker('spa+eng');
          await worker.setParameters({
            tessedit_pageseg_mode: Tesseract.PSM.AUTO_OSD,
            tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY,
            preserve_interword_spaces: '1',
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ÁÉÍÓÚáéíóúÑñÜü.,;:()-$%/@#& ',
            user_defined_dpi: '300'
          });
          
          const { data } = await worker.recognize(imageBuffer);
          await worker.terminate();

          // Clean up temporary file
          try {
            fs.unlinkSync(result.path);
          } catch (cleanupError) {
            console.warn(`Failed to cleanup temp file: ${result.path}`);
          }

          // Apply enhanced preprocessing
          const enhancedText = preprocessOCRTextEnhanced(data.text);

          return {
            text: enhancedText,
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
      // Process as image directly with enhancements
      let processBuffer = await enhanceImageForOCR(fileBuffer);
      
      // Enhanced Tesseract recognition for images
      const worker = await createWorker('spa+eng');
      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.AUTO_OSD,
        tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY,
        preserve_interword_spaces: '1',
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ÁÉÍÓÚáéíóúÑñÜü.,;:()-$%/@#& ',
        user_defined_dpi: '300'
      });
      
      const { data } = await worker.recognize(processBuffer);
      await worker.terminate();

      // Apply enhanced preprocessing
      const enhancedText = preprocessOCRTextEnhanced(data.text);

      return {
        text: enhancedText,
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

// Enhanced preprocessing for better AI extraction accuracy
function preprocessOCRTextEnhanced(text: string): string {
  let cleaned = text;

  // Step 1: Fix common OCR character recognition errors
  cleaned = cleaned.replace(/[òó]/g, 'o');
  cleaned = cleaned.replace(/[àá]/g, 'a');
  cleaned = cleaned.replace(/[èé]/g, 'e');
  cleaned = cleaned.replace(/[ìí]/g, 'i');
  cleaned = cleaned.replace(/[ùú]/g, 'u');
  cleaned = cleaned.replace(/[0O]/g, '0'); // Distinguish 0 from O
  cleaned = cleaned.replace(/[Il1|]/g, '1'); // Fix common 1/I/l confusion
  cleaned = cleaned.replace(/[S5]/g, (match, offset, string) => {
    // Context-aware S vs 5 replacement
    const before = string.charAt(offset - 1);
    const after = string.charAt(offset + 1);
    if (/\d/.test(before) || /\d/.test(after)) return '5';
    return 'S';
  });

  // Step 2: Normalize whitespace and line breaks
  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.replace(/\n\s*\n/g, '\n');

  // Step 3: Fix Spanish/Latin American invoice terminology with better patterns
  const termCorrections = {
    'Eml50r|Em150r|EmI50r': 'Emisor',
    'Factur4|F4ctura|Fáctura': 'Factura',
    'Fech4|Fécha': 'Fecha',
    'Tot4l|Tótāl': 'Total',
    'Subtot4l|Sub-total': 'Subtotal',
    'lVA|IVÁ': 'IVA',
    'NlT|N1T': 'NIT',
    'RFC|RFG': 'RFC',
    'CUlT|CU1T': 'CUIT',
    'Proveed0r|Prōveedor': 'Proveedor',
    'Cllente|ClIente': 'Cliente',
    'Adquirlente|Adquiriénte': 'Adquiriente',
    '0bra|Óbra': 'Obra',
    'Proyect0|Próyecto': 'Proyecto',
    'Compañl4|Compañía': 'Compañía',
    'Dlrección|Dirécción': 'Dirección'
  };

  for (const [pattern, replacement] of Object.entries(termCorrections)) {
    const regex = new RegExp(`\\b(${pattern})\\b`, 'gi');
    cleaned = cleaned.replace(regex, replacement);
  }

  // Step 4: Enhanced number formatting corrections
  // Fix Colombian peso formatting
  cleaned = cleaned.replace(/\$\s*([0-9]{1,3}(?:[.,][0-9]{3})*)[.,]([0-9]{2})/g, '$$1.$2');
  // Remove thousands separators in amounts
  cleaned = cleaned.replace(/([0-9]{1,3})\.([0-9]{3})\.([0-9]{3})/g, '$1$2$3');
  cleaned = cleaned.replace(/([0-9]{1,3})\.([0-9]{3})/g, '$1$2');
  // Fix decimal separators (Colombian format uses comma)
  cleaned = cleaned.replace(/([0-9]+),([0-9]{2})\b/g, '$1.$2');

  // Step 5: Enhanced date formatting with Colombian patterns
  cleaned = cleaned.replace(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g, '$3-$2-$1');
  cleaned = cleaned.replace(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/gi, (match, day, month, year) => {
    const months: { [key: string]: string } = {
      'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
      'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
      'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
    };
    const monthNum = months[month.toLowerCase()] || month;
    return `${year}-${monthNum.padStart(2, '0')}-${day.padStart(2, '0')}`;
  });

  // Step 6: Add enhanced structure markers for Colombian invoices
  cleaned = cleaned.replace(/\b(Emisor|EMISOR)\b/gi, '\n=== INFORMACIÓN DEL EMISOR ===\nEmisor');
  cleaned = cleaned.replace(/\b(Adquiriente|ADQUIRIENTE|Cliente|CLIENTE)\b/gi, '\n=== INFORMACIÓN DEL ADQUIRIENTE ===\nAdquiriente');
  cleaned = cleaned.replace(/\b(Factura|FACTURA)\s+(No\.?|N[oº]\.?|Número)\s*[:.]?\s*([A-Z0-9-]+)/gi, '\n=== DATOS DE LA FACTURA ===\nFactura Número: $3');
  cleaned = cleaned.replace(/\b(NIT|Nit)\s*[:.]?\s*([0-9]{6,12}[-]?[0-9]?)/gi, '\n--- NIT ---\nNIT: $2');
  cleaned = cleaned.replace(/\b(Total|TOTAL|Total\s+a\s+Pagar)\s*[:.]?\s*\$?\s*([0-9.,]+)/gi, '\n=== TOTALES ===\nTotal: $2');
  cleaned = cleaned.replace(/\b(IVA|Iva)\s*[:.]?\s*\$?\s*([0-9.,]+)/gi, '\n--- IMPUESTOS ---\nIVA: $2');
  cleaned = cleaned.replace(/\b(Subtotal|Sub-total|SUBTOTAL)\s*[:.]?\s*\$?\s*([0-9.,]+)/gi, '\n--- SUBTOTAL ---\nSubtotal: $2');

  // Step 7: Fix common Colombian address patterns
  cleaned = cleaned.replace(/\b(Calle|CLL|Cl)\s+([0-9]+[A-Z]?)\s+#\s*([0-9]+)\s*-\s*([0-9]+)/gi, 'Calle $2 #$3-$4');
  cleaned = cleaned.replace(/\b(Carrera|CRA|Cr)\s+([0-9]+[A-Z]?)\s+#\s*([0-9]+)\s*-\s*([0-9]+)/gi, 'Carrera $2 #$3-$4');

  // Step 8: Clean up extra spaces and normalize
  cleaned = cleaned.replace(/\s+/g, ' ').replace(/\n\s+/g, '\n').trim();

  return cleaned;
}

// Keep the original function for backward compatibility and alternative PDF processing
function preprocessOCRText(text: string): string {
  return preprocessOCRTextEnhanced(text);
}