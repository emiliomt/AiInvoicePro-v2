// Test script to debug subtotal extraction
const { parseInvoiceXML } = require('./server/services/xmlParser.ts');

// Test XML with different subtotal patterns
const testXMLs = [
  // Standard UBL format
  `<?xml version="1.0" encoding="UTF-8"?>
<Invoice>
  <cbc:TaxInclusiveAmount currencyID="COP">590.00</cbc:TaxInclusiveAmount>
  <cbc:TaxExclusiveAmount currencyID="COP">495.76</cbc:TaxExclusiveAmount>
  <cbc:TaxAmount currencyID="COP">94.24</cbc:TaxAmount>
</Invoice>`,
  
  // Alternative pattern with LineExtensionAmount
  `<?xml version="1.0" encoding="UTF-8"?>
<Invoice>
  <cbc:PayableAmount currencyID="COP">590.00</cbc:PayableAmount>
  <cbc:LineExtensionAmount currencyID="COP">495.76</cbc:LineExtensionAmount>
  <cbc:TaxAmount currencyID="COP">94.24</cbc:TaxAmount>
</Invoice>`,

  // Complex structure with LegalMonetaryTotal
  `<?xml version="1.0" encoding="UTF-8"?>
<Invoice>
  <cac:LegalMonetaryTotal>
    <cbc:TaxInclusiveAmount currencyID="COP">590.00</cbc:TaxInclusiveAmount>
    <cbc:TaxExclusiveAmount currencyID="COP">495.76</cbc:TaxExclusiveAmount>
    <cbc:PayableAmount currencyID="COP">590.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="COP">94.24</cbc:TaxAmount>
  </cac:TaxTotal>
</Invoice>`
];

console.log('Testing subtotal extraction with different XML patterns...\n');

testXMLs.forEach((xml, index) => {
  console.log(`Test ${index + 1}:`);
  console.log('XML:', xml.replace(/\n/g, '').replace(/\s+/g, ' '));
  
  try {
    const result = parseInvoiceXML(xml);
    console.log('Result:', {
      totalAmount: result.totalAmount,
      taxAmount: result.taxAmount,
      subtotal: result.subtotal,
      currency: result.currency
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  console.log('---\n');
});