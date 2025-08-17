import { parseStringPromise } from 'xml2js';
import fs from 'fs/promises';
import path from 'path';

// XML Processing Service for handling invoice XML files
export class XMLProcessingService {
  // Parse XML content to JSON
  async parseXML(xmlContent: string): Promise<any> {
    try {
      const result = await parseStringPromise(xmlContent, {
        explicitArray: false,
        ignoreAttrs: false,
        mergeAttrs: true
      });
      return result;
    } catch (error) {
      console.error('Error parsing XML:', error);
      throw new Error(`XML parsing failed: ${error.message}`);
    }
  }

  // Parse XML file from path
  async parseXMLFile(filePath: string): Promise<any> {
    try {
      const xmlContent = await fs.readFile(filePath, 'utf-8');
      return await this.parseXML(xmlContent);
    } catch (error) {
      console.error('Error reading/parsing XML file:', error);
      throw new Error(`XML file processing failed: ${error.message}`);
    }
  }

  // Extract invoice data from XML
  async extractInvoiceDataFromXML(xmlData: any): Promise<any> {
    try {
      // Generic XML invoice extraction logic
      const invoiceData = {
        invoiceNumber: this.findValue(xmlData, ['InvoiceNumber', 'DocumentNumber', 'Number']),
        vendorName: this.findValue(xmlData, ['SupplierName', 'VendorName', 'Supplier']),
        vendorTaxId: this.findValue(xmlData, ['SupplierTaxID', 'VendorTaxID', 'TaxID']),
        invoiceDate: this.findValue(xmlData, ['InvoiceDate', 'IssueDate', 'Date']),
        dueDate: this.findValue(xmlData, ['DueDate', 'PaymentDueDate']),
        totalAmount: this.findValue(xmlData, ['TotalAmount', 'GrandTotal', 'Total']),
        currency: this.findValue(xmlData, ['Currency', 'CurrencyCode']),
        lineItems: this.extractLineItems(xmlData)
      };

      return invoiceData;
    } catch (error) {
      console.error('Error extracting invoice data from XML:', error);
      throw error;
    }
  }

  // Helper to find values in nested XML objects
  private findValue(obj: any, keys: string[]): any {
    for (const key of keys) {
      const value = this.deepFind(obj, key);
      if (value !== undefined && value !== null) {
        return value;
      }
    }
    return null;
  }

  // Deep search for key in nested object
  private deepFind(obj: any, targetKey: string): any {
    if (typeof obj !== 'object' || obj === null) return undefined;

    if (obj[targetKey] !== undefined) {
      return obj[targetKey];
    }

    for (const key in obj) {
      const result = this.deepFind(obj[key], targetKey);
      if (result !== undefined) return result;
    }

    return undefined;
  }

  // Extract line items from XML
  private extractLineItems(xmlData: any): any[] {
    try {
      const lineItems = [];
      const items = this.findValue(xmlData, ['LineItems', 'Items', 'InvoiceLines', 'Lines']);
      
      if (Array.isArray(items)) {
        for (const item of items) {
          lineItems.push({
            description: this.findValue(item, ['Description', 'ItemDescription', 'Name']),
            quantity: this.findValue(item, ['Quantity', 'Qty']),
            unitPrice: this.findValue(item, ['UnitPrice', 'Price']),
            totalPrice: this.findValue(item, ['TotalPrice', 'LineTotal', 'Amount']),
            category: this.findValue(item, ['Category', 'Classification'])
          });
        }
      } else if (items) {
        // Single item
        lineItems.push({
          description: this.findValue(items, ['Description', 'ItemDescription', 'Name']),
          quantity: this.findValue(items, ['Quantity', 'Qty']),
          unitPrice: this.findValue(items, ['UnitPrice', 'Price']),
          totalPrice: this.findValue(items, ['TotalPrice', 'LineTotal', 'Amount']),
          category: this.findValue(items, ['Category', 'Classification'])
        });
      }

      return lineItems;
    } catch (error) {
      console.error('Error extracting line items:', error);
      return [];
    }
  }

  // Validate XML structure
  async validateXMLStructure(xmlData: any): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check for required invoice fields
    if (!this.findValue(xmlData, ['InvoiceNumber', 'DocumentNumber', 'Number'])) {
      errors.push('Missing invoice number');
    }

    if (!this.findValue(xmlData, ['SupplierName', 'VendorName', 'Supplier'])) {
      errors.push('Missing vendor/supplier name');
    }

    if (!this.findValue(xmlData, ['TotalAmount', 'GrandTotal', 'Total'])) {
      errors.push('Missing total amount');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Export instance
export const xmlProcessingService = new XMLProcessingService();