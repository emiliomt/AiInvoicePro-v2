import Tesseract from 'tesseract.js';

export async function processInvoiceOCR(fileBuffer: Buffer, invoiceId: number): Promise<string> {
  try {
    console.log(`Starting OCR processing for invoice ${invoiceId}`);
    
    const { data: { text } } = await Tesseract.recognize(fileBuffer, 'eng', {
      logger: m => console.log(`OCR Progress for invoice ${invoiceId}:`, m)
    });
    
    console.log(`OCR completed for invoice ${invoiceId}`);
    return text;
  } catch (error) {
    console.error(`OCR failed for invoice ${invoiceId}:`, error);
    throw new Error(`OCR processing failed: ${error.message}`);
  }
}

export async function processInvoiceOCRWithConfidence(fileBuffer: Buffer): Promise<{
  text: string;
  confidence: number;
}> {
  try {
    const { data } = await Tesseract.recognize(fileBuffer, 'eng');
    
    return {
      text: data.text,
      confidence: data.confidence / 100, // Convert to 0-1 scale
    };
  } catch (error) {
    console.error('OCR processing failed:', error);
    throw new Error(`OCR processing failed: ${error.message}`);
  }
}
