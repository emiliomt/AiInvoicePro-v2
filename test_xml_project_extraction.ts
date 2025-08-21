import { XMLProjectExtractor } from './server/services/xmlProjectExtractor';

// Test XML content examples
const testXMLExamples = [
  // Example 1: Direct project element
  `<invoice>
    <proyecto>HACIENDA SAN ANTONIO YARUMO</proyecto>
    <etapa>3</etapa>
    <direccion>TRANSVERSAL 18 SUR NO. 67-76</direccion>
    <ciudad>SOLEDAD</ciudad>
  </invoice>`,

  // Example 2: Project in observations text
  `<invoice>
    <observaciones>PROYECTO: HACIENDA SAN ANTONIO YARUMO ETAPA 3 DIRECCIÓN: TRANSVERSAL 18 SUR NO. 67-76 SOLEDAD ATLANTICO</observaciones>
    <total>1500000</total>
  </invoice>`,

  // Example 3: Colombian UBL format
  `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
    <cbc:Note>PROYECTO: URBANIZACIÓN PARQUE HEREDIA FASE 2</cbc:Note>
    <cac:DeliveryAddress>
      <cbc:StreetName>CALLE 15 NO. 23-45</cbc:StreetName>
      <cbc:CityName>BARRANQUILLA</cbc:CityName>
    </cac:DeliveryAddress>
  </Invoice>`,

  // Example 4: Project in line items
  `<invoice>
    <lineItem>
      <descripcion>CONSTRUCCIÓN DE EDIFICIO TORRE A EN CONJUNTO RESIDENCIAL LAS PALMAS</descripcion>
      <cantidad>1</cantidad>
      <precio>500000</precio>
    </lineItem>
  </invoice>`,

  // Example 5: Project in address context
  `<invoice>
    <direccionEntrega>PROYECTO HACIENDA EL ROSARIO ETAPA 1, TRANSVERSAL 25 NO. 45-67, BOGOTÁ</direccionEntrega>
    <concepto>Servicios de construcción</concepto>
  </invoice>`
];

async function testXMLProjectExtraction() {
  console.log('🧪 Testing XML Project Extraction Service\n');
  
  const extractor = new XMLProjectExtractor();
  
  for (let i = 0; i < testXMLExamples.length; i++) {
    const xmlContent = testXMLExamples[i];
    console.log(`📋 Test Case ${i + 1}:`);
    console.log(`XML Content: ${xmlContent.substring(0, 100)}...`);
    
    try {
      const result = await extractor.extractProjectInfo(xmlContent);
      
      console.log(`✅ Extraction Result:`);
      console.log(`   Project Name: ${result.projectName || 'N/A'}`);
      console.log(`   Project Code: ${result.projectCode || 'N/A'}`);
      console.log(`   Project Address: ${result.projectAddress || 'N/A'}`);
      console.log(`   Project City: ${result.projectCity || 'N/A'}`);
      console.log(`   Project Phase: ${result.projectPhase || 'N/A'}`);
      console.log(`   Project Type: ${result.projectType || 'N/A'}`);
      console.log(`   Extraction Method: ${result.extractionMethod}`);
      console.log(`   Confidence: ${result.confidence}%`);
      console.log(`   XML Path: ${result.xmlPath}`);
      console.log(`   XML Element: ${result.xmlElement}`);
      console.log(`   Work Type: ${result.additionalInfo.workType || 'N/A'}`);
      console.log(`   Contract Number: ${result.additionalInfo.contractNumber || 'N/A'}`);
      console.log(`   Order Number: ${result.additionalInfo.orderNumber || 'N/A'}`);
      console.log(`   Development Stage: ${result.additionalInfo.developmentStage || 'N/A'}`);
      console.log(`   Location: ${result.additionalInfo.location || 'N/A'}`);
      console.log(`   XML Namespace: ${result.additionalInfo.xmlNamespace || 'N/A'}`);
      console.log('');
      
    } catch (error) {
      console.log(`❌ Extraction failed: ${error.message}`);
      console.log('');
    }
  }
}

// Run the test
testXMLProjectExtraction().catch(console.error);
