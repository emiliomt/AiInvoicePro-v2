// Test script for AttachedDocument wrapper parsing

const xmlParserPath = './server/services/xmlParser.ts';

// Example AttachedDocument with embedded CDATA Invoice
const attachedDocumentXML = `<?xml version="1.0" encoding="UTF-8"?>
<AttachedDocument xmlns="urn:oasis:names:specification:ubl:schema:xsd:AttachedDocument-2"
                  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
                  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
    <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
    <cbc:DocumentType>Invoice</cbc:DocumentType>
    <cbc:Description><![CDATA[<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
    <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
    <cbc:ID>INV-12345</cbc:ID>
    <cbc:IssueDate>2025-01-28</cbc:IssueDate>
    <cbc:DueDate>2025-02-28</cbc:DueDate>
    <cac:AccountingSupplierParty>
        <cac:Party>
            <cac:PartyName>
                <cbc:Name>Test Vendor Corporation</cbc:Name>
            </cac:PartyName>
            <cac:PartyTaxScheme>
                <cbc:CompanyID>123456789-1</cbc:CompanyID>
            </cac:PartyTaxScheme>
        </cac:Party>
    </cac:AccountingSupplierParty>
    <cac:LegalMonetaryTotal>
        <cbc:TaxExclusiveAmount currencyID="COP">100000.00</cbc:TaxExclusiveAmount>
        <cbc:TaxInclusiveAmount currencyID="COP">119000.00</cbc:TaxInclusiveAmount>
        <cbc:PayableAmount currencyID="COP">119000.00</cbc:PayableAmount>
    </cac:LegalMonetaryTotal>
    <cac:TaxTotal>
        <cbc:TaxAmount currencyID="COP">19000.00</cbc:TaxAmount>
    </cac:TaxTotal>
</Invoice>]]></cbc:Description>
</AttachedDocument>`;

// Regular Invoice XML for comparison
const regularInvoiceXML = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
    <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
    <cbc:ID>INV-67890</cbc:ID>
    <cbc:IssueDate>2025-01-28</cbc:IssueDate>
    <cac:AccountingSupplierParty>
        <cac:Party>
            <cac:PartyName>
                <cbc:Name>Regular Vendor Inc</cbc:Name>
            </cac:PartyName>
        </cac:Party>
    </cac:AccountingSupplierParty>
    <cac:LegalMonetaryTotal>
        <cbc:PayableAmount currencyID="COP">250000.00</cbc:PayableAmount>
    </cac:LegalMonetaryTotal>
</Invoice>`;

console.log('AttachedDocument wrapper test created');
console.log('To test this functionality:');
console.log('1. Import parseInvoiceXML from xmlParser.ts');
console.log('2. Parse attachedDocumentXML - should extract embedded invoice data');
console.log('3. Parse regularInvoiceXML - should work normally');
console.log('4. Verify both return correct invoice numbers: INV-12345 and INV-67890');

module.exports = {
    attachedDocumentXML,
    regularInvoiceXML
};