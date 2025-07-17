
// XML Debug Tool - Enhanced version for invoice analysis
// Run with: node debug_xml.js <path-to-xml-file>

const fs = require('fs');

function debugXMLExtraction(xmlFilePath) {
  console.log('🔍 ENHANCED XML EXTRACTION DEBUGGER');
  console.log('===================================\n');
  
  try {
    const xmlContent = fs.readFileSync(xmlFilePath, 'utf8');
    console.log('📁 File loaded successfully');
    console.log(`📏 Content length: ${xmlContent.length} characters\n`);
    
    // 1. Enhanced amount analysis with Colombian format support
    console.log('💰 ENHANCED AMOUNT ANALYSIS:');
    console.log('-----------------------------');
    
    const amountTags = xmlContent.match(/<[^>]*Amount[^>]*currencyID="([^"]*)"[^>]*>([^<]*)<\/[^>]*>/gi) || [];
    console.log(`Found ${amountTags.length} amount tags with currency:`);
    amountTags.forEach((tag, i) => {
      const match = tag.match(/currencyID="([^"]*)"[^>]*>([^<]*)</);
      if (match) {
        const currency = match[1];
        const amount = match[2];
        const cleanAmount = cleanColombianAmount(amount);
        console.log(`  ${i+1}. Currency: ${currency}, Amount: ${amount} → Cleaned: ${cleanAmount}`);
      }
    });
    
    // 2. Specific UBL tag analysis
    console.log('\n📊 UBL TAG SPECIFIC ANALYSIS:');
    console.log('-----------------------------');
    
    const ublTags = {
      'TaxInclusiveAmount': 'Total with tax',
      'TaxExclusiveAmount': 'Subtotal (before tax)',
      'PayableAmount': 'Amount payable',
      'TaxAmount': 'Tax amount',
      'LineExtensionAmount': 'Line extension amount',
      'TaxableAmount': 'Taxable base amount'
    };
    
    Object.entries(ublTags).forEach(([tag, description]) => {
      const pattern = new RegExp(`<cbc:${tag}[^>]*currencyID="([^"]*)"[^>]*>([^<]*)<\/cbc:${tag}>`, 'gi');
      const matches = xmlContent.match(pattern);
      if (matches) {
        console.log(`✓ ${tag} (${description}):`);
        matches.forEach(match => {
          const details = match.match(/currencyID="([^"]*)"[^>]*>([^<]*)</);
          if (details) {
            console.log(`    ${details[2]} ${details[1]}`);
          }
        });
      } else {
        console.log(`✗ ${tag}: Not found`);
      }
    });
    
    // 3. Enhanced project analysis with context
    console.log('\n🏗️ ENHANCED PROJECT ANALYSIS:');
    console.log('-----------------------------');
    
    const projectSources = [
      { tag: 'ProjectReference', description: 'Direct project reference' },
      { tag: 'OrderReference', description: 'Order reference' },
      { tag: 'ContractDocumentReference', description: 'Contract reference' },
      { tag: 'Note', description: 'Notes field' },
      { tag: 'Description', description: 'Description field' }
    ];
    
    projectSources.forEach(({ tag, description }) => {
      const pattern = new RegExp(`<cbc:${tag}[^>]*>([^<]*)<\/cbc:${tag}>`, 'gi');
      const matches = xmlContent.match(pattern);
      if (matches) {
        console.log(`✓ ${description} (${tag}):`);
        matches.forEach(match => {
          const content = match.match(/>([^<]*)</)[1];
          console.log(`    "${content}"`);
          
          // Check for project keywords in content
          const projectKeywords = ['PROYECTO', 'OBRA', 'PROJECT', 'CONTRATO', 'CONSTRUCTION'];
          const foundKeywords = projectKeywords.filter(keyword => 
            content.toUpperCase().includes(keyword)
          );
          if (foundKeywords.length > 0) {
            console.log(`    → Contains project keywords: ${foundKeywords.join(', ')}`);
          }
        });
      }
    });
    
    // 4. Party information analysis
    console.log('\n👥 PARTY INFORMATION ANALYSIS:');
    console.log('------------------------------');
    
    ['AccountingSupplierParty', 'AccountingCustomerParty'].forEach(partyType => {
      console.log(`\n${partyType}:`);
      const partyPattern = new RegExp(`<cac:${partyType}[^>]*>(.*?)<\/cac:${partyType}>`, 'gis');
      const partyMatch = partyPattern.exec(xmlContent);
      
      if (partyMatch) {
        const partyContent = partyMatch[1];
        
        // Extract key information
        const name = extractFromParty(partyContent, 'RegistrationName') || extractFromParty(partyContent, 'Name');
        const taxId = extractFromParty(partyContent, 'CompanyID') || extractFromParty(partyContent, 'ID');
        const streetName = extractFromParty(partyContent, 'StreetName');
        const cityName = extractFromParty(partyContent, 'CityName');
        
        console.log(`  Name: ${name || 'Not found'}`);
        console.log(`  Tax ID: ${taxId || 'Not found'}`);
        console.log(`  Street: ${streetName || 'Not found'}`);
        console.log(`  City: ${cityName || 'Not found'}`);
      } else {
        console.log(`  Not found in XML`);
      }
    });
    
    // 5. Line items analysis
    console.log('\n📋 LINE ITEMS ANALYSIS:');
    console.log('----------------------');
    
    const linePattern = /<cac:InvoiceLine[^>]*>(.*?)<\/cac:InvoiceLine>/gi;
    const lineMatches = [...xmlContent.matchAll(linePattern)];
    
    console.log(`Found ${lineMatches.length} invoice lines:`);
    lineMatches.slice(0, 3).forEach((lineMatch, i) => {
      const lineContent = lineMatch[1];
      const description = extractFromParty(lineContent, 'Description') || extractFromParty(lineContent, 'Name');
      const quantity = extractFromParty(lineContent, 'InvoicedQuantity');
      const price = extractFromParty(lineContent, 'PriceAmount');
      
      console.log(`  Line ${i+1}:`);
      console.log(`    Description: ${description || 'Not found'}`);
      console.log(`    Quantity: ${quantity || 'Not found'}`);
      console.log(`    Price: ${price || 'Not found'}`);
    });
    
    // 6. Delivery address analysis (potential project location)
    console.log('\n📍 DELIVERY ADDRESS ANALYSIS:');
    console.log('-----------------------------');
    
    const deliveryPattern = /<cac:Delivery[^>]*>(.*?)<\/cac:Delivery>/gi;
    const deliveryMatch = deliveryPattern.exec(xmlContent);
    
    if (deliveryMatch) {
      const deliveryContent = deliveryMatch[1];
      const deliveryStreet = extractFromParty(deliveryContent, 'StreetName');
      const deliveryCity = extractFromParty(deliveryContent, 'CityName');
      const deliveryState = extractFromParty(deliveryContent, 'CountrySubentity');
      
      console.log(`  Delivery Street: ${deliveryStreet || 'Not found'}`);
      console.log(`  Delivery City: ${deliveryCity || 'Not found'}`);
      console.log(`  Delivery State: ${deliveryState || 'Not found'}`);
    } else {
      console.log('  No delivery information found');
    }
    
  } catch (error) {
    console.error('❌ Error reading file:', error.message);
  }
}

function cleanColombianAmount(value) {
  if (!value) return null;
  
  const cleaned = value.replace(/<[^>]*>/g, '').trim();
  const numericMatch = cleaned.match(/[\d.,]+/);
  if (!numericMatch) return null;
  
  let numericValue = numericMatch[0];
  
  // Handle Colombian format: 1.234.567,89 -> 1234567.89
  if (numericValue.includes(',') && numericValue.includes('.')) {
    const lastComma = numericValue.lastIndexOf(',');
    const lastPeriod = numericValue.lastIndexOf('.');
    
    if (lastComma > lastPeriod) {
      const parts = numericValue.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        numericValue = parts[0].replace(/\./g, '') + '.' + parts[1];
      }
    }
  }
  
  const num = parseFloat(numericValue);
  return !isNaN(num) && num >= 0 ? num.toFixed(2) : null;
}

function extractFromParty(content, tagName) {
  const patterns = [
    new RegExp(`<${tagName}[^>]*>([^<]*)<\/${tagName}>`, 'gi'),
    new RegExp(`<cbc:${tagName}[^>]*>([^<]*)<\/cbc:${tagName}>`, 'gi'),
    new RegExp(`<cac:${tagName}[^>]*>([^<]*)<\/cac:${tagName}>`, 'gi'),
  ];
  
  for (const pattern of patterns) {
    const match = pattern.exec(content);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return null;
}

// Usage
if (process.argv.length < 3) {
  console.log('Usage: node debug_xml.js <path-to-xml-file>');
  console.log('Example: node debug_xml.js ./test_invoice.xml');
  console.log('Example: node debug_xml.js ./uploads/invoice.xml');
} else {
  debugXMLExtraction(process.argv[2]);
}
