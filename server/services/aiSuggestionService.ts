
import type { Invoice } from "@shared/schema";

export interface ExtractionSuggestion {
  field: string;
  issue: string;
  suggestion: string;
  confidence: number;
  correctedValue?: string;
}

export class AISuggestionService {
  
  static analyzeExtractionErrors(invoice: Invoice, ocrText: string): ExtractionSuggestion[] {
    const suggestions: ExtractionSuggestion[] = [];
    const extractedData = invoice.extractedData as any;

    // Analyze total amount issues
    if (this.hasTotalAmountIssue(extractedData, ocrText)) {
      const amountSuggestion = this.suggestTotalAmount(ocrText);
      suggestions.push({
        field: "totalAmount",
        issue: "Total amount is zero, missing, or incorrectly extracted",
        suggestion: `Look for currency amounts in OCR text. Possible values found: ${amountSuggestion.possibleAmounts.join(', ')}`,
        confidence: amountSuggestion.confidence,
        correctedValue: amountSuggestion.suggestedAmount
      });
    }

    // Analyze vendor name issues
    if (this.hasVendorNameIssue(extractedData, ocrText)) {
      const vendorSuggestion = this.suggestVendorName(ocrText);
      suggestions.push({
        field: "vendorName",
        issue: "Vendor name missing or incomplete",
        suggestion: `Company name likely appears near NIT. Possible values: ${vendorSuggestion.possibleNames.join(', ')}`,
        confidence: vendorSuggestion.confidence,
        correctedValue: vendorSuggestion.suggestedName
      });
    }

    // Analyze tax ID issues
    if (this.hasTaxIdIssue(extractedData, ocrText)) {
      const taxIdSuggestion = this.suggestTaxId(ocrText);
      suggestions.push({
        field: "taxId",
        issue: "Tax ID (NIT/RFC) not found or incomplete",
        suggestion: `Tax ID patterns found in document: ${taxIdSuggestion.possibleIds.join(', ')}`,
        confidence: taxIdSuggestion.confidence,
        correctedValue: taxIdSuggestion.suggestedId
      });
    }

    // Analyze invoice number issues
    if (this.hasInvoiceNumberIssue(extractedData, ocrText)) {
      const invoiceNumSuggestion = this.suggestInvoiceNumber(ocrText);
      suggestions.push({
        field: "invoiceNumber",
        issue: "Invoice number missing or unclear",
        suggestion: `Invoice number patterns: ${invoiceNumSuggestion.possibleNumbers.join(', ')}`,
        confidence: invoiceNumSuggestion.confidence,
        correctedValue: invoiceNumSuggestion.suggestedNumber
      });
    }

    // Analyze date issues
    if (this.hasDateIssue(extractedData, ocrText)) {
      const dateSuggestion = this.suggestInvoiceDate(ocrText);
      suggestions.push({
        field: "invoiceDate",
        issue: "Invoice date missing or incorrectly formatted",
        suggestion: `Date patterns found: ${dateSuggestion.possibleDates.join(', ')}`,
        confidence: dateSuggestion.confidence,
        correctedValue: dateSuggestion.suggestedDate
      });
    }

    return suggestions;
  }

  private static hasTotalAmountIssue(extractedData: any, ocrText: string): boolean {
    const amount = extractedData?.totalAmount;
    return !amount || amount === "0" || amount === "0.00" || parseFloat(amount) === 0;
  }

  private static suggestTotalAmount(ocrText: string) {
    // Look for currency patterns in OCR text - Colombian peso specific
    const currencyPatterns = [
      /TOTAL\s*A?\s*PAGAR[:\s]*\$?\s*([\d,]+\.?\d*)/i,
      /VALOR\s*TOTAL[:\s]*\$?\s*([\d,]+\.?\d*)/i,
      /SUBTOTAL[:\s]*\$?\s*([\d,]+\.?\d*)/i,
      /NETO\s*A?\s*PAGAR[:\s]*\$?\s*([\d,]+\.?\d*)/i,
      /IMPORTE\s*TOTAL[:\s]*\$?\s*([\d,]+\.?\d*)/i,
      /\$\s*([\d,]+\.?\d*)/g,
      /COP\s*([\d,]+\.?\d*)/g,
      /USD\s*([\d,]+\.?\d*)/g,
      /([\d,]+\.?\d*)\s*COP/g
    ];

    const possibleAmounts: string[] = [];
    
    for (const pattern of currencyPatterns) {
      const matches = ocrText.match(pattern);
      if (matches) {
        if (pattern.global) {
          const globalMatches = [...ocrText.matchAll(pattern)];
          globalMatches.forEach(match => {
            if (match[1]) possibleAmounts.push(match[1].replace(/,/g, ''));
          });
        } else if (matches[1]) {
          possibleAmounts.push(matches[1].replace(/,/g, ''));
        }
      }
    }

    // Filter out obviously wrong amounts (too small or too large)
    const validAmounts = possibleAmounts
      .map(a => parseFloat(a))
      .filter(a => a > 0 && a < 10000000)
      .sort((a, b) => b - a); // Sort descending, total is usually the largest

    return {
      possibleAmounts: possibleAmounts.slice(0, 3),
      suggestedAmount: validAmounts.length > 0 ? validAmounts[0].toString() : null,
      confidence: validAmounts.length > 0 ? 85 : 30
    };
  }

  private static hasVendorNameIssue(extractedData: any, ocrText: string): boolean {
    const vendorName = extractedData?.vendorName;
    return !vendorName || vendorName.length < 3 || vendorName.toLowerCase().includes('vendor');
  }

  private static suggestVendorName(ocrText: string) {
    // Look for company name patterns (usually near NIT or at the top)
    const companyPatterns = [
      /NIT[:\s]*[\d\-]+[:\s]*([A-Z\s&.,]+)(?=\n|\r|$)/i,
      /^([A-Z][A-Z\s&.,]{5,40})\s*(?:S\.A\.S|S\.A|LTDA|S\.L|LLC)/im,
      /RAZON\s*SOCIAL[:\s]*([A-Z\s&.,]+)/i
    ];

    const possibleNames: string[] = [];

    for (const pattern of companyPatterns) {
      const match = ocrText.match(pattern);
      if (match && match[1]) {
        const cleanName = match[1].trim().replace(/\s+/g, ' ');
        if (cleanName.length > 3 && cleanName.length < 100) {
          possibleNames.push(cleanName);
        }
      }
    }

    return {
      possibleNames: possibleNames.slice(0, 3),
      suggestedName: possibleNames.length > 0 ? possibleNames[0] : null,
      confidence: possibleNames.length > 0 ? 80 : 25
    };
  }

  private static hasTaxIdIssue(extractedData: any, ocrText: string): boolean {
    return !extractedData?.taxId && !extractedData?.buyerTaxId;
  }

  private static suggestTaxId(ocrText: string) {
    // Look for NIT/RFC patterns
    const taxIdPatterns = [
      /NIT[:\s]*([\d\-]+)/i,
      /RFC[:\s]*([A-Z0-9\-]+)/i,
      /(\d{9,12})/g
    ];

    const possibleIds: string[] = [];

    for (const pattern of taxIdPatterns) {
      if (pattern.global) {
        const matches = [...ocrText.matchAll(pattern)];
        matches.forEach(match => {
          if (match[1] && match[1].length >= 9) {
            possibleIds.push(match[1]);
          }
        });
      } else {
        const match = ocrText.match(pattern);
        if (match && match[1]) {
          possibleIds.push(match[1]);
        }
      }
    }

    return {
      possibleIds: possibleIds.slice(0, 3),
      suggestedId: possibleIds.length > 0 ? possibleIds[0] : null,
      confidence: possibleIds.length > 0 ? 75 : 20
    };
  }

  private static hasInvoiceNumberIssue(extractedData: any, ocrText: string): boolean {
    return !extractedData?.invoiceNumber;
  }

  private static suggestInvoiceNumber(ocrText: string) {
    // Look for invoice number patterns
    const invoicePatterns = [
      /FACTURA\s*N[°º]?[:\s]*(\w+)/i,
      /No\.?\s*FACTURA[:\s]*(\w+)/i,
      /INVOICE[:\s]*(\w+)/i,
      /(\d{4,10})/g
    ];

    const possibleNumbers: string[] = [];

    for (const pattern of invoicePatterns) {
      if (pattern.global) {
        const matches = [...ocrText.matchAll(pattern)];
        matches.forEach(match => {
          if (match[1] && match[1].length >= 4) {
            possibleNumbers.push(match[1]);
          }
        });
      } else {
        const match = ocrText.match(pattern);
        if (match && match[1]) {
          possibleNumbers.push(match[1]);
        }
      }
    }

    return {
      possibleNumbers: possibleNumbers.slice(0, 3),
      suggestedNumber: possibleNumbers.length > 0 ? possibleNumbers[0] : null,
      confidence: possibleNumbers.length > 0 ? 70 : 25
    };
  }

  private static hasDateIssue(extractedData: any, ocrText: string): boolean {
    return !extractedData?.invoiceDate;
  }

  private static suggestInvoiceDate(ocrText: string) {
    // Look for date patterns
    const datePatterns = [
      /FECHA\s*DE?\s*EXPEDICION[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /(\d{1,2}\/\d{1,2}\/\d{4})/g,
      /(\d{4}-\d{1,2}-\d{1,2})/g
    ];

    const possibleDates: string[] = [];

    for (const pattern of datePatterns) {
      if (pattern.global) {
        const matches = [...ocrText.matchAll(pattern)];
        matches.forEach(match => {
          if (match[1]) {
            possibleDates.push(match[1]);
          }
        });
      } else {
        const match = ocrText.match(pattern);
        if (match && match[1]) {
          possibleDates.push(match[1]);
        }
      }
    }

    return {
      possibleDates: possibleDates.slice(0, 3),
      suggestedDate: possibleDates.length > 0 ? possibleDates[0] : null,
      confidence: possibleDates.length > 0 ? 65 : 20
    };
  }
}
