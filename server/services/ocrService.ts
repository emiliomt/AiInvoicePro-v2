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
      // Try text extraction first (much faster for text-based PDFs)
      try {
        const pdfParse = await import('pdf-parse');
        const pdfData = await pdfParse.default(fileBuffer);
        if (pdfData.text && pdfData.text.trim().length > 50) {
          console.log(`Fast text extraction successful for invoice ${invoiceId}, text length: ${pdfData.text.length}`);
          return pdfData.text;
        }
      } catch (textExtractionError) {
        console.log(`Text extraction failed for invoice ${invoiceId}, falling back to OCR`);
      }
      console.log(`Converting PDF to image for invoice ${invoiceId}`);

      // Convert PDF to images and process with OCR - optimized settings
      let convert;
      try {
        convert = fromBuffer(fileBuffer, {
          density: 150, // Reduced from 200 for faster processing
          saveFilename: `invoice_${invoiceId}_page`,
          savePath: "/tmp",
          format: "png",
          width: 1200, // Reduced from 1600 for faster processing
          height: 1200 // Reduced from 1600 for faster processing
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
              if (m.status === 'recognizing text' && m.progress % 0.1 === 0) { // Log every 10%
                console.log(`OCR Progress for invoice ${invoiceId}: ${Math.round(m.progress * 100)}%`);
              }
            },
            tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK, // Faster page segmentation
            tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY, // Use only LSTM for speed
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
          if (m.status === 'recognizing text' && m.progress % 0.1 === 0) { // Log every 10%
            console.log(`OCR Progress for invoice ${invoiceId}: ${Math.round(m.progress * 100)}%`);
          }
        },
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK, // Faster page segmentation
        tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY, // Use only LSTM for speed
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

async function pdfToOCR(buffer: Buffer, invoiceId: number): Promise<string> {
  const tempDir = '/tmp';
  const outputPath = path.join(tempDir, `invoice_${invoiceId}_page`);
  let tempPdfPath = '';
  let imagePath = '';

  try {
    console.log(`Converting PDF to image for invoice ${invoiceId}`);

    // Convert PDF to PNG
    const options = {
      format: 'png',
      out_dir: tempDir,
      out_prefix: `invoice_${invoiceId}_page`,
      page: null // Convert all pages, but we'll use the first one
    };

    // Write buffer to temp file for poppler-utils
    tempPdfPath = path.join(tempDir, `temp_${invoiceId}.pdf`);
    fs.writeFileSync(tempPdfPath, buffer);

    await new Promise<void>((resolve, reject) => {
      const convert = poppler.convert(tempPdfPath, options, (err: any) => {
        if (err) {
          reject(new Error(`PDF conversion failed: ${err.message || err}`));
        } else {
          resolve();
        }
      });
    });

    // Read the first converted page
    imagePath = `${outputPath}.1.png`;
    console.log(`PDF converted successfully for invoice ${invoiceId}, running OCR on: ${imagePath}`);

    if (!fs.existsSync(imagePath)) {
      throw new Error(`Converted image not found: ${imagePath}`);
    }

    const imageBuffer = fs.readFileSync(imagePath);
    console.log(`Image buffer size for invoice ${invoiceId}: ${imageBuffer.length} bytes`);

    // Validate image buffer
    if (imageBuffer.length === 0) {
      throw new Error('Converted image is empty');
    }

    const result = await imageToOCR(imageBuffer, invoiceId);
    return result;
  } catch (error) {
    console.error(`Error converting PDF to OCR for invoice ${invoiceId}:`, error);
    throw new Error(`PDF to OCR conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    // Clean up temp files
    try {
      if (tempPdfPath && fs.existsSync(tempPdfPath)) {
        fs.unlinkSync(tempPdfPath);
      }
      if (imagePath && fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    } catch (cleanupError) {
      console.warn(`Failed to clean up temp files for invoice ${invoiceId}:`, cleanupError);
    }
  }
}

async function imageToOCR(buffer: Buffer, invoiceId: number): Promise<string> {
  let worker: any = null;

  try {
    console.log(`Running OCR on image for invoice ${invoiceId}, buffer size: ${buffer.length}`);

    // Validate buffer
    if (!buffer || buffer.length === 0) {
      throw new Error('Invalid or empty image buffer');
    }

    // Check if buffer appears to be a valid image by checking magic bytes
    const magicBytes = buffer.slice(0, 8);
    const isPNG = magicBytes.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47]));
    const isJPEG = magicBytes.slice(0, 3).equals(Buffer.from([0xFF, 0xD8, 0xFF]));

    if (!isPNG && !isJPEG) {
      console.warn(`Warning: Image buffer for invoice ${invoiceId} may not be a valid PNG or JPEG`);
    }

    worker = await createWorker('eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          const progress = Math.round(m.progress * 100);
          console.log(`OCR Progress for invoice ${invoiceId}: ${progress}%`);
        }
      }
    });

    const { data: { text } } = await worker.recognize(buffer);

    console.log(`OCR completed for invoice ${invoiceId}, text length: ${text.length}`);
    return text || '';
  } catch (error) {
    console.error(`OCR failed for invoice ${invoiceId}:`, error);
    throw new Error(`OCR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch (terminateError) {
        console.warn(`Failed to terminate OCR worker for invoice ${invoiceId}:`, terminateError);
      }
    }
  }
}

export async function processInvoiceOCR(buffer: Buffer, invoiceId: number): Promise<string> {
  try {
    console.log(`Starting OCR processing for invoice ${invoiceId}, buffer size: ${buffer.size} bytes`);

    const fileType = detectFileType(buffer);
    console.log(`File type detected for invoice ${invoiceId}: ${fileType}`);

    let textContent = '';

    if (fileType === 'PDF') {
      try {
        // Try direct text extraction first
        const pdfData = await pdf(buffer);
        textContent = pdfData.text;
        console.log(`Direct PDF text extraction for invoice ${invoiceId}, length: ${textContent.length}`);

        if (textContent && textContent.trim().length > 50) {
          return textContent;
        }

        console.log(`Text extraction failed for invoice ${invoiceId}, falling back to OCR`);

        // Fallback to OCR if direct extraction fails
        textContent = await pdfToOCR(buffer, invoiceId);
      } catch (pdfError) {
        console.error(`PDF processing failed for invoice ${invoiceId}:`, pdfError);
        // Return a basic fallback text instead of throwing
        return `PDF processing failed: ${pdfError instanceof Error ? pdfError.message : 'Unknown error'}. Please try re-uploading the file or use a different format.`;
      }
    } else {
      // For images, use OCR directly
      try {
        textContent = await imageToOCR(buffer, invoiceId);
      } catch (imageError) {
        console.error(`Image OCR failed for invoice ${invoiceId}:`, imageError);
        return `Image processing failed: ${imageError instanceof Error ? imageError.message : 'Unknown error'}. Please try re-uploading the file.`;
      }
    }

    if (!textContent || textContent.trim().length < 10) {
      return 'OCR processing completed but extracted insufficient text. The document may be unclear or in an unsupported format.';
    }

    console.log(`OCR processing completed for invoice ${invoiceId}, extracted ${textContent.length} characters`);
    return textContent;
  } catch (error) {
    console.error(`OCR processing failed for invoice ${invoiceId}:`, error);
    return `OCR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}. Please try re-uploading the file.`;
  }
}