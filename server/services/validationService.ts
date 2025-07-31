// Validation Service for Post-Extraction Workflow
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  validationScore: number;
}

export async function validateInvoice(invoice: any): Promise<ValidationResult> {
  try {
    console.log('🔍 Validating invoice data...');
    
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Required fields validation
    if (!invoice.vendorName || invoice.vendorName.trim().length === 0) {
      errors.push('Vendor name is required');
    }
    
    if (!invoice.invoiceNumber || invoice.invoiceNumber.trim().length === 0) {
      errors.push('Invoice number is required');
    }
    
    if (!invoice.totalAmount || parseFloat(invoice.totalAmount) <= 0) {
      errors.push('Valid total amount is required');
    }
    
    // Date validation
    if (invoice.invoiceDate) {
      const invoiceDate = new Date(invoice.invoiceDate);
      const today = new Date();
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(today.getFullYear() - 1);
      
      if (invoiceDate > today) {
        warnings.push('Invoice date is in the future');
      }
      
      if (invoiceDate < oneYearAgo) {
        warnings.push('Invoice date is more than 1 year old');
      }
    }
    
    // Amount validation
    const totalAmount = parseFloat(invoice.totalAmount || '0');
    if (totalAmount > 50000) {
      warnings.push('High value invoice - requires additional approval');
    }
    
    // Currency validation
    if (!invoice.currency) {
      warnings.push('Currency not specified - defaulting to COP');
    }
    
    // Calculate validation score
    const maxScore = 100;
    const errorPenalty = errors.length * 30;
    const warningPenalty = warnings.length * 10;
    const validationScore = Math.max(0, maxScore - errorPenalty - warningPenalty);
    
    const isValid = errors.length === 0;
    
    console.log(`✅ Validation complete: ${isValid ? 'VALID' : 'INVALID'} (score: ${validationScore})`);
    
    return {
      isValid,
      errors,
      warnings,
      validationScore
    };
    
  } catch (error) {
    console.error('❌ Invoice validation failed:', error);
    return {
      isValid: false,
      errors: ['Validation service error'],
      warnings: [],
      validationScore: 0
    };
  }
}