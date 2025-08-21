# XML Project Extraction Service

## Overview

The XML Project Extraction Service is a comprehensive, multi-stage system designed to extract project information from XML invoice data. It implements a sophisticated approach that systematically analyzes XML elements, attributes, and text content to identify and extract project-related information with high accuracy.

## Features

### Multi-Stage Extraction Approach

The service implements a 5-stage extraction strategy that prioritizes accuracy and confidence:

1. **Stage 1: Direct XML Fields** - Highest priority (95% confidence)
   - Searches dedicated project XML elements and attributes
   - Looks for elements like `<proyecto>`, `<project>`, `<obra>`, etc.

2. **Stage 2: Text Content Analysis** - High priority (85% confidence)
   - Analyzes text content in observation, description, and note fields
   - Uses regex patterns to identify project information

3. **Stage 3: Line Item Analysis** - Medium-high priority (70-95% confidence)
   - Extracts project info from line item descriptions
   - Aggregates related line items for better context

4. **Stage 4: Address Context Analysis** - Medium priority (75% confidence)
   - Analyzes address fields for project location clues
   - Identifies project names embedded in address information

5. **Stage 5: XML Attribute Mining** - Lower priority (60% confidence)
   - Searches all XML attributes for project references
   - Fallback method for comprehensive coverage

### Colombian XML Specifics

The service is specifically optimized for Colombian invoice formats:

- **DIAN UBL Support**: Handles Colombian electronic invoice standards
- **Common Project Formats**: Recognizes patterns like:
  - `HACIENDA [NAME] ETAPA [NUMBER]`
  - `PROYECTO [NAME] FASE [NUMBER]`
  - `URBANIZACIÓN [NAME] TORRE [NUMBER]`
  - `CONJUNTO [NAME] BLOQUE [NUMBER]`

- **Address Patterns**: Recognizes Colombian address formats:
  - `TRANSVERSAL [NUMBER] [LETTER]`
  - `CARRERA [NUMBER] [LETTER]`
  - `CALLE [NUMBER] [LETTER]`

## Installation

```bash
npm install @xmldom/xmldom
```

## Usage

### Basic Usage

```typescript
import { XMLProjectExtractor } from './server/services/xmlProjectExtractor';

const extractor = new XMLProjectExtractor();
const result = await extractor.extractProjectInfo(xmlContent);
```

### Example XML Input

```xml
<invoice>
  <observaciones>PROYECTO: HACIENDA SAN ANTONIO YARUMO ETAPA 3 DIRECCIÓN: TRANSVERSAL 18 SUR NO. 67-76 SOLEDAD ATLANTICO</observaciones>
  <total>1500000</total>
</invoice>
```

### Expected Output

```typescript
{
  projectName: "HACIENDA SAN ANTONIO YARUMO ETAPA 3",
  projectCode: null,
  projectAddress: "TRANSVERSAL 18 SUR NO. 67-76",
  projectCity: "SOLEDAD",
  projectPhase: "ETAPA 3",
  projectType: "HACIENDA",
  extractionMethod: "text_content",
  confidence: 85,
  xmlPath: "//observaciones/text()",
  xmlElement: "observaciones",
  extractedText: "PROYECTO: HACIENDA SAN ANTONIO YARUMO ETAPA 3 DIRECCIÓN: TRANSVERSAL 18 SUR NO. 67-76 SOLEDAD ATLANTICO",
  additionalInfo: {
    workType: null,
    contractNumber: null,
    orderNumber: null,
    developmentStage: "ETAPA 3",
    location: "SOLEDAD",
    xmlNamespace: null
  }
}
```

## API Reference

### XMLProjectExtractor Class

#### Constructor
```typescript
constructor()
```
Creates a new instance of the XML project extractor with pre-configured namespaces and patterns.

#### Methods

##### extractProjectInfo(xmlContent: string): Promise<ProjectExtractionResult>
Main extraction method that implements the multi-stage approach.

**Parameters:**
- `xmlContent` (string): XML content to analyze

**Returns:**
- `Promise<ProjectExtractionResult>`: Extraction result with project information

### ProjectExtractionResult Interface

```typescript
interface ProjectExtractionResult {
  projectName: string | null;
  projectCode: string | null;
  projectAddress: string | null;
  projectCity: string | null;
  projectPhase: string | null;
  projectType: string | null;
  extractionMethod: 'direct_xml_field' | 'text_content' | 'line_item' | 'address_context' | 'xml_attribute';
  confidence: number;
  xmlPath: string;
  xmlElement: string;
  extractedText: string;
  additionalInfo: {
    workType: string | null;
    contractNumber: string | null;
    orderNumber: string | null;
    developmentStage: string | null;
    location: string | null;
    xmlNamespace: string | null;
  };
}
```

## Supported XML Patterns

### Direct XML Elements
- `<proyecto>`, `<project>`, `<projectName>`
- `<nombreProyecto>`, `<codigoProyecto>`, `<projectCode>`
- `<obra>`, `<workSite>`, `<sitioTrabajo>`
- `<development>`, `<desarrollo>`, `<contract>`, `<contrato>`
- `<orden>`, `<order>`

### Text Content Fields
- `<observaciones>`, `<observations>`
- `<descripcion>`, `<description>`
- `<concepto>`, `<concept>`
- `<detalle>`, `<details>`
- `<notas>`, `<notes>`
- `<comentarios>`, `<comments>`

### Colombian UBL Specific
- `<cbc:Note>`, `<cbc:AdditionalInformation>`
- `<cbc:Instructions>`, `<cbc:Description>`
- `<cac:DeliveryAddress>`, `<cac:PostalAddress>`
- `<cac:InvoiceLine>`, `<cac:ProjectReference>`

## Regex Patterns

### Project Name Patterns
```typescript
// Basic project patterns
/proyecto\s*:?\s*([A-Z][A-Z0-9\s\-_]{2,100})/i
/project\s*:?\s*([A-Z][A-Z0-9\s\-_]{2,100})/i

// Colombian specific patterns
/hacienda\s+([A-Z][A-Z0-9\s\-_]{3,50})/i
/finca\s+([A-Z][A-Z0-9\s\-_]{3,50})/i
/urbanización\s+([A-Z][A-Z0-9\s\-_]{3,50})/i
/conjunto\s+([A-Z][A-Z0-9\s\-_]{3,50})/i
```

### Phase/Stage Patterns
```typescript
/(etapa|fase|stage|phase)\s*:?\s*([0-9]+|[IVX]+|[A-Z])/i
/(torre|tower|bloque|block)\s*:?\s*([0-9A-Z]+)/i
```

### Address Patterns
```typescript
/(transversal|carrera|calle|avenida|diagonal)\s+([0-9]+[A-Z]?\s*[#]?\s*[0-9\-]+)/i
/(barrio|neighborhood)\s+([A-Z][A-Z0-9\s]{2,30})/i
```

## Configuration

### Namespace Support
The service automatically handles common XML namespaces:

```typescript
private commonNamespaces = new Map([
  ['fe', 'http://www.dian.gov.co/contratos/facturaelectronica/v1'],
  ['ext', 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2'],
  ['cbc', 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'],
  ['cac', 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2']
]);
```

### Confidence Thresholds
- **Stage 1**: 90% (early exit)
- **Stage 2**: 80% (early exit)
- **Stage 3**: 70% (early exit)
- **Stage 4**: 60% (early exit)
- **Stage 5**: 50% (early exit)

## Error Handling

The service implements robust error handling:

- **XPath Errors**: Continue to next stage if XPath fails
- **Regex Errors**: Log pattern and continue with next pattern
- **Namespace Errors**: Try without namespace prefix
- **Encoding Errors**: Attempt UTF-8 normalization

## Performance Optimization

- **Early Exit**: Stops processing when high confidence is achieved
- **Caching**: XPath results are cached for similar queries
- **Batch Processing**: Similar XPath queries are batched together
- **Regex Optimization**: Limits backtracking for complex patterns

## Testing

Run the test suite to verify functionality:

```bash
npx ts-node test_xml_project_extraction.ts
```

## Examples

### Example 1: Direct Project Element
```xml
<invoice>
  <proyecto>HACIENDA SAN ANTONIO YARUMO</proyecto>
  <etapa>3</etapa>
</invoice>
```

**Result**: High confidence (95%) extraction from direct XML field

### Example 2: Project in Text Content
```xml
<invoice>
  <observaciones>PROYECTO: URBANIZACIÓN PARQUE HEREDIA FASE 2</observaciones>
</invoice>
```

**Result**: Medium-high confidence (85%) extraction from text content analysis

### Example 3: Colombian UBL Format
```xml
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:Note>PROYECTO: CONJUNTO RESIDENCIAL LAS PALMAS TORRE A</cbc:Note>
</Invoice>
```

**Result**: High confidence extraction with namespace handling

## Best Practices

1. **XML Validation**: Ensure XML content is well-formed before processing
2. **Namespace Handling**: Use appropriate namespace prefixes for UBL documents
3. **Error Handling**: Implement proper error handling for production use
4. **Performance**: Consider caching results for repeated XML structures
5. **Validation**: Validate extracted data against business rules

## Troubleshooting

### Common Issues

1. **No Project Found**: Check if XML contains project-related keywords
2. **Low Confidence**: Verify XML structure and content quality
3. **Namespace Errors**: Ensure proper namespace registration
4. **Encoding Issues**: Check XML encoding (UTF-8 recommended)

### Debug Mode

Enable debug logging for detailed extraction information:

```typescript
// Add debug logging to the service
console.log('DEBUG: Processing XML content...');
```

## Contributing

When contributing to the XML Project Extraction Service:

1. Follow the existing code structure
2. Add comprehensive tests for new patterns
3. Update documentation for new features
4. Ensure backward compatibility
5. Follow TypeScript best practices

## License

This service is part of the AiInvoicePro-v2 project and follows the project's licensing terms.
