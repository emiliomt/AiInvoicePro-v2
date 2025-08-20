# XML Data Extraction System Overview
# This file shows the complete XML data extraction logic used in the invoice processing system

import defusedxml.ElementTree as ET
import re
import os
from typing import Optional, Dict, Any

class XMLInvoiceExtractor:
    """
    Main XML extraction class used in server/services/pythonRpaService.py
    This handles Colombian electronic invoices in UBL (Universal Business Language) format
    """
    
    def extract_invoice_token(self, filename, file_path=None, file_type='xml'):
        """Extract unique invoice token from filename with enhanced regex-based matching"""
        try:
            base_name = os.path.splitext(filename)[0]
            
            # For XML files, try to extract additional metadata from content
            if file_type == 'xml' and file_path and os.path.exists(file_path):
                try:
                    tree = ET.parse(file_path)
                    root = tree.getroot()
                    
                    # Find total amount in XML content (multiple possible tags)
                    total_amount = None
                    amount_tags = [
                        './/{*}PayableAmount',      # Most common total amount
                        './/{*}TotalAmount',        # Alternative total
                        './/{*}LineExtensionAmount', # Line extension amount
                        './/{*}TaxExclusiveAmount'  # Pre-tax amount
                    ]
                    
                    for tag in amount_tags:
                        element = root.find(tag)
                        if element is not None and element.text:
                            try:
                                total_amount = float(element.text.strip())
                                break
                            except:
                                continue
                    
                    # Create composite token with amount if available
                    if total_amount is not None:
                        normalized_amount = round(total_amount, 2)
                        token = f"{base_name}_{normalized_amount}"
                    else:
                        token = base_name
                        
                except Exception as e:
                    token = base_name
            else:
                token = base_name
            
            return {
                'token': token,
                'document_number': base_name,
                'base_name': base_name
            }
            
        except Exception as e:
            return {'token': filename, 'document_number': filename, 'base_name': filename}

    def extract_buyer_tax_id_from_xml(self, xml_content: str) -> Optional[str]:
        """Extract buyer tax ID from XML content, handling AttachedDocument wrappers"""
        try:
            # Check if this is an AttachedDocument wrapper with embedded CDATA content
            if '<AttachedDocument' in xml_content and '<![CDATA[' in xml_content:
                # Extract the CDATA content from Description tag
                cdata_pattern = r'<cbc:Description><!\[CDATA\[(.*?)\]\]></cbc:Description>'
                cdata_match = re.search(cdata_pattern, xml_content, re.DOTALL)
                
                if cdata_match and cdata_match.group(1):
                    embedded_xml = cdata_match.group(1).strip()
                    return self.extract_buyer_tax_id_from_xml(embedded_xml)  # Recursive call
            
            # Extract buyer tax ID from AccountingCustomerParty
            customer_pattern = r'<cac:AccountingCustomerParty[^>]*>(.*?)</cac:AccountingCustomerParty>'
            customer_match = re.search(customer_pattern, xml_content, re.DOTALL | re.IGNORECASE)
            
            if customer_match:
                customer_content = customer_match.group(1)
                
                # Try different patterns for tax ID extraction
                tax_id_patterns = [
                    r'<cbc:CompanyID[^>]*>([^<]+)</cbc:CompanyID>',
                    r'<cbc:ID[^>]*>([^<]+)</cbc:ID>',
                    r'<cbc:IdentificationCode[^>]*>([^<]+)</cbc:IdentificationCode>',
                    r'<cbc:TaxSchemeID[^>]*>([^<]+)</cbc:TaxSchemeID>'
                ]
                
                for pattern in tax_id_patterns:
                    match = re.search(pattern, customer_content, re.IGNORECASE)
                    if match and match.group(1).strip():
                        tax_id = match.group(1).strip()
                        # Skip country codes like "CO"
                        if tax_id and tax_id.upper() != 'CO' and len(tax_id) >= 6:
                            return tax_id
            
            return None
            
        except Exception as e:
            return None

    def parse_xml_invoice_data(self, xml_content: str) -> Dict[str, Any]:
        """
        Main XML parsing method that extracts all invoice data
        This method is called from the automation workflow
        """
        try:
            # Handle AttachedDocument wrapper with CDATA
            if '<AttachedDocument' in xml_content and '<![CDATA[' in xml_content:
                cdata_pattern = r'<cbc:Description><!\[CDATA\[(.*?)\]\]></cbc:Description>'
                cdata_match = re.search(cdata_pattern, xml_content, re.DOTALL)
                
                if cdata_match and cdata_match.group(1):
                    xml_content = cdata_match.group(1).strip()
            
            # Parse XML structure
            root = ET.fromstring(xml_content)
            
            # Extract basic invoice information
            invoice_data = {
                'vendorName': self._extract_vendor_name(root),
                'invoiceNumber': self._extract_invoice_number(root),
                'totalAmount': self._extract_total_amount(root),
                'currency': self._extract_currency(root),
                'invoiceDate': self._extract_invoice_date(root),
                'lineItems': self._extract_line_items(root),
                'buyerTaxId': self.extract_buyer_tax_id_from_xml(xml_content),
                'projectName': self._extract_project_info(xml_content)
            }
            
            return invoice_data
            
        except Exception as e:
            return {'error': f'XML parsing failed: {str(e)}'}

    def _extract_vendor_name(self, root) -> str:
        """Extract vendor/supplier name from XML"""
        vendor_patterns = [
            './/{*}AccountingSupplierParty//{*}RegistrationName',
            './/{*}AccountingSupplierParty//{*}Name',
            './/{*}Party//{*}PartyName//{*}Name',
            './/{*}PartyLegalEntity//{*}RegistrationName'
        ]
        
        for pattern in vendor_patterns:
            element = root.find(pattern)
            if element is not None and element.text:
                return element.text.strip()
        
        return 'Unknown Vendor'

    def _extract_invoice_number(self, root) -> str:
        """Extract invoice number from XML"""
        number_patterns = [
            './/{*}ID',
            './/{*}InvoiceNumber',
            './/{*}DocumentNumber'
        ]
        
        for pattern in number_patterns:
            element = root.find(pattern)
            if element is not None and element.text:
                return element.text.strip()
        
        return 'Unknown'

    def _extract_total_amount(self, root) -> str:
        """Extract total amount from XML"""
        amount_patterns = [
            './/{*}PayableAmount',
            './/{*}TotalAmount', 
            './/{*}LineExtensionAmount',
            './/{*}TaxInclusiveAmount'
        ]
        
        for pattern in amount_patterns:
            element = root.find(pattern)
            if element is not None and element.text:
                try:
                    return str(float(element.text.strip()))
                except:
                    continue
        
        return '0.00'

    def _extract_currency(self, root) -> str:
        """Extract currency from XML"""
        currency_patterns = [
            './/{*}PayableAmount',
            './/{*}TotalAmount',
            './/{*}DocumentCurrencyCode'
        ]
        
        for pattern in currency_patterns:
            element = root.find(pattern)
            if element is not None:
                currency_id = element.get('currencyID')
                if currency_id:
                    return currency_id
        
        return 'COP'  # Default to Colombian Peso

    def _extract_invoice_date(self, root) -> str:
        """Extract invoice date from XML"""
        date_patterns = [
            './/{*}IssueDate',
            './/{*}InvoiceDate',
            './/{*}Date'
        ]
        
        for pattern in date_patterns:
            element = root.find(pattern)
            if element is not None and element.text:
                return element.text.strip()
        
        return ''

    def _extract_line_items(self, root) -> list:
        """Extract line items from XML"""
        line_items = []
        
        # Find invoice lines
        lines = root.findall('.//{*}InvoiceLine') or root.findall('.//{*}LineItem')
        
        for line in lines:
            try:
                item = {
                    'description': '',
                    'quantity': '1',
                    'unitPrice': '0.00',
                    'totalPrice': '0.00'
                }
                
                # Extract description
                desc_elem = line.find('.//{*}Description') or line.find('.//{*}Name')
                if desc_elem is not None and desc_elem.text:
                    item['description'] = desc_elem.text.strip()
                
                # Extract quantity
                qty_elem = line.find('.//{*}InvoicedQuantity') or line.find('.//{*}Quantity')
                if qty_elem is not None and qty_elem.text:
                    try:
                        item['quantity'] = str(float(qty_elem.text.strip()))
                    except:
                        pass
                
                # Extract unit price
                price_elem = line.find('.//{*}PriceAmount')
                if price_elem is not None and price_elem.text:
                    try:
                        item['unitPrice'] = str(float(price_elem.text.strip()))
                    except:
                        pass
                
                # Extract line extension amount (total for this line)
                total_elem = line.find('.//{*}LineExtensionAmount')
                if total_elem is not None and total_elem.text:
                    try:
                        item['totalPrice'] = str(float(total_elem.text.strip()))
                    except:
                        pass
                
                if item['description']:  # Only add if we have a description
                    line_items.append(item)
                    
            except Exception as e:
                continue
        
        return line_items

    def _extract_project_info(self, xml_content: str) -> str:
        """Extract project information from XML content using regex patterns"""
        try:
            # Look for project-related information in various formats
            project_patterns = [
                r'<cbc:Note[^>]*>(.*?)</cbc:Note>',
                r'<cbc:Instructions[^>]*>(.*?)</cbc:Instructions>',
                r'<cbc:Description[^>]*>(.*?)</cbc:Description>',
                r'datos cufe.*?=([^"]+)',
                r'NumFac:\s*([^"]+)',
                r'proyecto[:\s]+([^,\s]+)',
                r'obra[:\s]+([^,\s]+)'
            ]
            
            for pattern in project_patterns:
                matches = re.findall(pattern, xml_content, re.IGNORECASE | re.DOTALL)
                if matches:
                    for match in matches:
                        if match and len(match.strip()) > 3:
                            return match.strip()[:100]  # Limit length
            
            return 'Not found'
            
        except Exception as e:
            return 'Not found'


# Example usage and test patterns
if __name__ == "__main__":
    extractor = XMLInvoiceExtractor()
    
    # Example XML content (Colombian UBL format)
    sample_xml = """
    <?xml version="1.0" encoding="UTF-8"?>
    <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
        <cbc:ID>T04138699</cbc:ID>
        <cbc:IssueDate>2025-06-09</cbc:IssueDate>
        <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
        <cac:AccountingSupplierParty>
            <cac:Party>
                <cac:PartyLegalEntity>
                    <cbc:RegistrationName>CALYPSO BARRANQUILLA S.A.S</cbc:RegistrationName>
                </cac:PartyLegalEntity>
            </cac:Party>
        </cac:AccountingSupplierParty>
        <cac:AccountingCustomerParty>
            <cac:Party>
                <cac:PartyIdentification>
                    <cbc:ID>86052780</cbc:ID>
                </cac:PartyIdentification>
            </cac:Party>
        </cac:AccountingCustomerParty>
        <cac:LegalMonetaryTotal>
            <cbc:PayableAmount currencyID="COP">46800.00</cbc:PayableAmount>
        </cac:LegalMonetaryTotal>
        <cac:InvoiceLine>
            <cbc:ID>1</cbc:ID>
            <cbc:InvoicedQuantity unitCode="NIU">3.00</cbc:InvoicedQuantity>
            <cbc:LineExtensionAmount currencyID="COP">39327.73</cbc:LineExtensionAmount>
            <cac:Item>
                <cbc:Description>CABUYA ECO?12 X 1 X 750ML</cbc:Description>
            </cac:Item>
            <cac:Price>
                <cbc:PriceAmount currencyID="COP">15600.00</cbc:PriceAmount>
            </cac:Price>
        </cac:InvoiceLine>
    </Invoice>
    """
    
    # Test the extraction
    result = extractor.parse_xml_invoice_data(sample_xml)
    print("Extracted data:", result)