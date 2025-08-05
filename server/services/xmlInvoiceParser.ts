import * as xml2js from 'xml2js';
import { storage } from '../storage';

interface XmlParserResult {
  success: boolean;
  data?: any;
  error?: string;
  confidenceScore: number;
  extractionMethod: 'xml_parser' | 'ai_extraction';
  processingTime: number;
  xmlProcessed: boolean;
  validationStatus: 'validated' | 'pending' | 'rejected';
}

interface ColombianNitValidation {
  isValid: boolean;
  formattedNit: string;
  checkDigit: number;
}

export class XmlInvoiceParser {
  private static readonly CONFIDENCE_SCORE = 0.95;
  private static readonly DEFAULT_CURRENCY = 'COP';

  /**
   * Parse XML invoice with UBL format and Colombian specifications
   */
  static async parseXmlInvoice(xmlContent: string): Promise<XmlParserResult> {
    const startTime = Date.now();
    
    try {
      console.log('🔄 [XML_PARSER] Starting XML invoice parsing...');
      
      // Extract CDATA content if wrapped in AttachedDocument
      const extractedXml = this.extractCDataContent(xmlContent);
      
      // Parse XML with xml2js
      const parser = new xml2js.Parser({
        explicitArray: false,
        mergeAttrs: true,
        normalizeTags: true,
        ignoreAttrs: false
      });
      
      const parsedXml = await parser.parseStringPromise(extractedXml);
      console.log('✅ [XML_PARSER] XML structure parsed successfully');
      
      // Extract invoice data based on UBL format
      const extractedData = this.extractInvoiceData(parsedXml);
      
      // Validate Colombian NIT
      if (extractedData.taxId) {
        const nitValidation = this.validateColombianNit(extractedData.taxId);
        if (nitValidation.isValid) {
          extractedData.taxId = nitValidation.formattedNit;
        }
      }
      
      // Validate and format data
      const validationResult = this.validateExtractedData(extractedData);
      
      const processingTime = Date.now() - startTime;
      console.log(`✅ [XML_PARSER] XML parsing completed in ${processingTime}ms`);
      
      return {
        success: true,
        data: extractedData,
        confidenceScore: this.CONFIDENCE_SCORE,
        extractionMethod: 'xml_parser',
        processingTime,
        xmlProcessed: true,
        validationStatus: validationResult.isValid ? 'validated' : 'pending'
      };
      
    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      console.error('❌ [XML_PARSER] XML parsing failed:', error.message);
      
      return {
        success: false,
        error: error.message,
        confidenceScore: 0,
        extractionMethod: 'xml_parser',
        processingTime,
        xmlProcessed: false,
        validationStatus: 'rejected'
      };
    }
  }

  /**
   * Extract CDATA content from AttachedDocument wrapper
   */
  private static extractCDataContent(xmlContent: string): string {
    // Check for AttachedDocument wrapper with CDATA
    const cdataMatch = xmlContent.match(/<!\[CDATA\[(.*?)\]\]>/s);
    if (cdataMatch && cdataMatch[1]) {
      console.log('📄 [XML_PARSER] Extracted CDATA content from AttachedDocument');
      return cdataMatch[1].trim();
    }
    
    return xmlContent;
  }

  /**
   * Extract structured invoice data from parsed XML
   */
  private static extractInvoiceData(parsedXml: any): any {
    console.log('🔍 [XML_PARSER] Extracting invoice data from XML structure...');
    
    // Try different root elements (Invoice, CreditNote)
    const root = parsedXml.Invoice || parsedXml.CreditNote || parsedXml.invoice || parsedXml.creditnote;
    
    if (!root) {
      throw new Error('No valid invoice root element found in XML');
    }

    const extractedData: any = {};

    try {
      // Extract invoice number with smart selection
      extractedData.invoiceNumber = this.extractInvoiceNumber(root);
      
      // Extract dates
      extractedData.invoiceDate = this.formatDate(root.IssueDate || root.issuedate);
      extractedData.dueDate = this.formatDate(root.DueDate || root.duedate);
      
      // Extract supplier information
      const supplier = this.extractSupplierInfo(root);
      extractedData.vendorName = supplier.name;
      extractedData.taxId = supplier.taxId;
      
      // Extract customer information
      const customer = this.extractCustomerInfo(root);
      extractedData.companyName = customer.name;
      extractedData.buyerTaxId = customer.taxId;
      
      // Extract amounts
      const amounts = this.extractAmounts(root);
      extractedData.totalAmount = amounts.total;
      extractedData.subtotal = amounts.subtotal;
      extractedData.taxAmount = amounts.tax;
      extractedData.currency = amounts.currency || this.DEFAULT_CURRENCY;
      
      // Extract project information
      const projectInfo = this.extractProjectInfo(root);
      extractedData.projectName = projectInfo.name;
      extractedData.projectAddress = projectInfo.address;
      
      // Extract line items
      extractedData.lineItems = this.extractLineItems(root);
      
      console.log('✅ [XML_PARSER] Successfully extracted all invoice data');
      return extractedData;
      
    } catch (error: any) {
      console.error('❌ [XML_PARSER] Error extracting invoice data:', error.message);
      throw error;
    }
  }

  /**
   * Extract invoice number with readability scoring
   */
  private static extractInvoiceNumber(root: any): string {
    const candidates = [
      root.ID,
      root.id,
      root.InvoiceNumber,
      root.invoicenumber,
      root.DocumentReference?.ID,
      root.documentreference?.id
    ].filter(Boolean);

    if (candidates.length === 0) {
      throw new Error('Invoice number not found in XML');
    }

    // Score candidates based on readability (alphanumeric, reasonable length)
    const scored = candidates.map((candidate: string) => ({
      value: candidate,
      score: this.scoreInvoiceNumber(candidate)
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored[0].value;
  }

  /**
   * Score invoice number based on readability
   */
  private static scoreInvoiceNumber(value: string): number {
    let score = 0;
    
    // Prefer alphanumeric format
    if (/^[A-Z0-9-]+$/i.test(value)) score += 30;
    
    // Prefer reasonable length (4-20 characters)
    if (value.length >= 4 && value.length <= 20) score += 20;
    
    // Prefer format with letters and numbers
    if (/[A-Z]/i.test(value) && /[0-9]/.test(value)) score += 25;
    
    // Prefer format with common separators
    if (/[-_]/.test(value)) score += 15;
    
    return score;
  }

  /**
   * Extract supplier information
   */
  private static extractSupplierInfo(root: any): { name: string; taxId: string } {
    const supplier = root.AccountingSupplierParty || root.accountingsupplierparty;
    
    if (!supplier) {
      throw new Error('Supplier information not found in XML');
    }

    const party = supplier.Party || supplier.party;
    const name = party?.PartyName?.Name || party?.partyname?.name || 
                 party?.PartyLegalEntity?.RegistrationName || party?.partylegalentity?.registrationname ||
                 'Unknown Vendor';

    const taxId = party?.PartyTaxScheme?.CompanyID || party?.partytaxscheme?.companyid ||
                  party?.PartyIdentification?.ID || party?.partyidentification?.id ||
                  '';

    return { name, taxId };
  }

  /**
   * Extract customer information
   */
  private static extractCustomerInfo(root: any): { name: string; taxId: string } {
    const customer = root.AccountingCustomerParty || root.accountingcustomerparty;
    
    if (!customer) {
      return { name: '', taxId: '' };
    }

    const party = customer.Party || customer.party;
    const name = party?.PartyName?.Name || party?.partyname?.name || 
                 party?.PartyLegalEntity?.RegistrationName || party?.partylegalentity?.registrationname ||
                 '';

    const taxId = party?.PartyTaxScheme?.CompanyID || party?.partytaxscheme?.companyid ||
                  party?.PartyIdentification?.ID || party?.partyidentification?.id ||
                  '';

    return { name, taxId };
  }

  /**
   * Extract amounts with currency handling
   */
  private static extractAmounts(root: any): { total: number; subtotal: number; tax: number; currency: string } {
    const monetaryTotal = root.LegalMonetaryTotal || root.legalmonetarytotal;
    const taxTotal = root.TaxTotal || root.taxtotal;

    let total = 0;
    let subtotal = 0;
    let tax = 0;
    let currency = this.DEFAULT_CURRENCY;

    if (monetaryTotal) {
      // Try different total amount fields
      const totalAmount = monetaryTotal.TaxInclusiveAmount || monetaryTotal.taxinclusiveamount ||
                         monetaryTotal.PayableAmount || monetaryTotal.payableamount;
      
      if (totalAmount) {
        total = parseFloat(totalAmount._ || totalAmount);
        currency = totalAmount.currencyID || totalAmount.currencyid || currency;
      }

      // Subtotal
      const subtotalAmount = monetaryTotal.TaxExclusiveAmount || monetaryTotal.taxexclusiveamount ||
                            monetaryTotal.LineExtensionAmount || monetaryTotal.lineextensionamount;
      
      if (subtotalAmount) {
        subtotal = parseFloat(subtotalAmount._ || subtotalAmount);
      }
    }

    // Tax amount
    if (taxTotal) {
      const taxAmount = taxTotal.TaxAmount || taxTotal.taxamount;
      if (taxAmount) {
        tax = parseFloat(taxAmount._ || taxAmount);
      }
    }

    return { total, subtotal, tax, currency };
  }

  /**
   * Extract project information with enhanced pattern matching
   */
  private static extractProjectInfo(root: any): { name: string; address: string } {
    // Look for project info in various places
    const delivery = root.Delivery || root.delivery;
    const orderRef = root.OrderReference || root.orderreference;
    const additional = root.AdditionalDocumentReference || root.additionaldocumentreference;

    let name = '';
    let address = '';

    // Extract from delivery location
    if (delivery?.DeliveryLocation) {
      const location = delivery.DeliveryLocation;
      address = location.Address?.StreetName || location.address?.streetname || '';
      
      // Colombian project pattern matching
      const projectPatterns = [
        /PROYECTO\s+([A-Z\s]+)/i,
        /OBRA\s+([A-Z\s]+)/i,
        /CONSTRUCCIÓN\s+([A-Z\s]+)/i
      ];

      for (const pattern of projectPatterns) {
        const match = address.match(pattern);
        if (match) {
          name = match[1].trim();
          break;
        }
      }
    }

    // Extract from order reference
    if (!name && orderRef?.ID) {
      name = orderRef.ID;
    }

    return { name, address };
  }

  /**
   * Extract line items
   */
  private static extractLineItems(root: any): any[] {
    const lines = root.InvoiceLine || root.invoiceline || root.CreditNoteLine || root.creditnoteline;
    
    if (!lines) {
      return [];
    }

    const lineArray = Array.isArray(lines) ? lines : [lines];
    
    return lineArray.map((line: any) => ({
      description: line.Item?.Name || line.item?.name || 'No description',
      quantity: parseFloat(line.InvoicedQuantity || line.invoicedquantity || line.Quantity || line.quantity || 1),
      unitPrice: parseFloat(line.Price?.PriceAmount || line.price?.priceamount || 0),
      totalPrice: parseFloat(line.LineExtensionAmount || line.lineextensionamount || 0)
    }));
  }

  /**
   * Validate Colombian NIT with check digit
   */
  private static validateColombianNit(nit: string): ColombianNitValidation {
    // Remove non-numeric characters except dash
    const cleanNit = nit.replace(/[^\d-]/g, '');
    
    // Split NIT and check digit
    const parts = cleanNit.split('-');
    const nitNumber = parts[0];
    const providedCheckDigit = parts[1] ? parseInt(parts[1]) : null;

    if (!/^\d{8,10}$/.test(nitNumber)) {
      return { isValid: false, formattedNit: nit, checkDigit: 0 };
    }

    // Calculate check digit
    const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
    let sum = 0;
    
    for (let i = 0; i < nitNumber.length; i++) {
      const digit = parseInt(nitNumber[nitNumber.length - 1 - i]);
      sum += digit * weights[i];
    }
    
    const remainder = sum % 11;
    const checkDigit = remainder >= 2 ? 11 - remainder : remainder;

    const isValid = providedCheckDigit === null || providedCheckDigit === checkDigit;
    const formattedNit = `${nitNumber}-${checkDigit}`;

    return { isValid, formattedNit, checkDigit };
  }

  /**
   * Validate extracted data
   */
  private static validateExtractedData(data: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.invoiceNumber) errors.push('Invoice number is required');
    if (!data.vendorName) errors.push('Vendor name is required');
    if (!data.totalAmount || data.totalAmount <= 0) errors.push('Valid total amount is required');
    if (!data.invoiceDate) errors.push('Invoice date is required');

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Format date to YYYY-MM-DD
   */
  private static formatDate(dateStr: string): string {
    if (!dateStr) return '';
    
    try {
      const date = new Date(dateStr);
      return date.toISOString().split('T')[0];
    } catch {
      return dateStr;
    }
  }
}

// Export for use in other services
export const xmlInvoiceParser = new XmlInvoiceParser();