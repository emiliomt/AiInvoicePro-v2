import { DOMParser } from '@xmldom/xmldom';

export interface ProjectExtractionResult {
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

export class XMLProjectExtractor {
  private parser: DOMParser;
  private commonNamespaces: Map<string, string>;

  constructor() {
    this.parser = new DOMParser();
    this.commonNamespaces = new Map([
      ['fe', 'http://www.dian.gov.co/contratos/facturaelectronica/v1'],
      ['ext', 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2'],
      ['cbc', 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'],
      ['cac', 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2']
    ]);
  }

  /**
   * Main extraction method that implements the multi-stage approach
   */
  async extractProjectInfo(xmlContent: string): Promise<ProjectExtractionResult> {
    try {
      // Parse XML content
      const doc = this.parser.parseFromString(xmlContent, 'text/xml');
      
      // Stage 1: Direct XML fields
      const stage1Result = await this.stage1DirectXMLFields(doc);
      if (stage1Result.confidence >= 90) {
        return stage1Result;
      }

      // Stage 2: Text content analysis
      const stage2Result = await this.stage2TextContentAnalysis(doc);
      if (stage2Result.confidence >= 80) {
        return stage2Result;
      }

      // Stage 3: Line item analysis
      const stage3Result = await this.stage3LineItemAnalysis(doc);
      if (stage3Result.confidence >= 70) {
        return stage3Result;
      }

      // Stage 4: Address context analysis
      const stage4Result = await this.stage4AddressContextAnalysis(doc);
      if (stage4Result.confidence >= 60) {
        return stage4Result;
      }

      // Stage 5: XML attribute mining
      const stage5Result = await this.stage5XMLAttributeMining(doc);
      if (stage5Result.confidence >= 50) {
        return stage5Result;
      }

      // Return the best result found
      const allResults = [stage1Result, stage2Result, stage3Result, stage4Result, stage5Result];
      return allResults.reduce((best, current) => 
        current.confidence > best.confidence ? current : best
      );

    } catch (error) {
      console.error('Error in XML project extraction:', error);
      return this.createDefaultResult('Error occurred during extraction', 0);
    }
  }

  /**
   * Stage 1: Check dedicated project XML elements and attributes
   */
  private async stage1DirectXMLFields(doc: Document): Promise<ProjectExtractionResult> {
    const primaryPaths = [
      '//proyecto',
      '//project',
      '//projectName',
      '//nombreProyecto',
      '//codigoProyecto',
      '//projectCode',
      '//obra',
      '//workSite',
      '//sitioTrabajo',
      '//development',
      '//desarrollo',
      '//contract',
      '//contrato',
      '//orden',
      '//order',
      // Colombian DIAN UBL specific paths
      '//ext:ExtensionContent//proyecto',
      '//ext:ExtensionContent//obra',
      '//ext:ExtensionContent//development',
      '//cac:ProjectReference//cbc:ID',
      '//cac:OrderReference//cbc:ID',
      '//cac:ContractDocumentReference//cbc:ID'
    ];

    const projectAttributes = [
      '@nombre', '@name', '@codigo', '@code', '@id', '@ref', 
      '@referencia', '@etapa', '@phase', '@ubicacion', '@location'
    ];

    for (const xpath of primaryPaths) {
      try {
        const elements = this.evaluateXPath(doc, xpath);
        if (elements && elements.length > 0) {
          const element = elements[0] as Element;
          const textContent = this.getTextContent(element);
          
          if (textContent && textContent.length >= 3) {
            return this.createProjectResult({
              projectName: textContent,
              projectCode: this.extractProjectCode(element),
              projectAddress: null,
              projectCity: null,
              projectPhase: this.extractProjectPhase(element),
              projectType: this.determineProjectType(textContent),
              extractionMethod: 'direct_xml_field',
              confidence: 95,
              xmlPath: xpath,
              xmlElement: element.nodeName,
              extractedText: textContent,
              additionalInfo: {
                workType: null,
                contractNumber: null,
                orderNumber: null,
                developmentStage: this.extractProjectPhase(element),
                location: null,
                xmlNamespace: this.getNamespace(element)
              }
            });
          }
        }
      } catch (error) {
        continue; // Continue to next XPath if this one fails
      }
    }

    // Check attributes
    for (const attrPath of projectAttributes) {
      try {
        const attributes = this.evaluateXPath(doc, `//*[${attrPath}]`);
        if (attributes && attributes.length > 0) {
          const element = attributes[0] as Element;
          const attrName = attrPath.substring(1);
          const attrValue = element.getAttribute(attrName);
          
          if (attrValue && attrValue.length >= 3) {
            return this.createProjectResult({
              projectName: attrValue,
              projectCode: null,
              projectAddress: null,
              projectCity: null,
              projectPhase: null,
              projectType: this.determineProjectType(attrValue),
              extractionMethod: 'direct_xml_field',
              confidence: 90,
              xmlPath: `//*[${attrPath}]`,
              xmlElement: element.nodeName,
              extractedText: attrValue,
              additionalInfo: {
                workType: null,
                contractNumber: null,
                orderNumber: null,
                developmentStage: null,
                location: null,
                xmlNamespace: this.getNamespace(element)
              }
            });
          }
        }
      } catch (error) {
        continue;
      }
    }

    return this.createDefaultResult('No direct XML fields found', 0);
  }

  /**
   * Stage 2: Search within XML text content for project indicators
   */
  private async stage2TextContentAnalysis(doc: Document): Promise<ProjectExtractionResult> {
    const textFields = [
      '//observaciones/text()',
      '//observations/text()',
      '//descripcion/text()',
      '//description/text()',
      '//concepto/text()',
      '//concept/text()',
      '//detalle/text()',
      '//details/text()',
      '//notas/text()',
      '//notes/text()',
      '//comentarios/text()',
      '//comments/text()',
      '//trabajo/text()',
      '//work/text()',
      '//servicio/text()',
      '//service/text()',
      '//actividad/text()',
      '//activity/text()',
      '//referencia/text()',
      '//reference/text()',
      '//memo/text()',
      '//asunto/text()',
      '//subject/text()',
      // Colombian DIAN specific fields
      '//cbc:AdditionalInformation[contains(text(), "proyecto") or contains(text(), "PROYECTO")]/text()',
      '//cbc:Note[contains(text(), "proyecto") or contains(text(), "PROYECTO")]/text()',
      '//cbc:Instructions[contains(text(), "proyecto") or contains(text(), "PROYECTO")]/text()'
    ];

    const exactPatterns = [
      /proyecto\s*:?\s*([A-Z][A-Z0-9\s\-_]{2,100})/i,
      /project\s*:?\s*([A-Z][A-Z0-9\s\-_]{2,100})/i,
      /obra\s*:?\s*([A-Z][A-Z0-9\s\-_]{2,100})/i,
      /desarrollo\s*:?\s*([A-Z][A-Z0-9\s\-_]{2,100})/i,
      /construcción\s*:?\s*([A-Z][A-Z0-9\s\-_]{2,100})/i,
      /contrato\s*:?\s*([A-Z0-9\-_]{3,50})/i,
      /contract\s*:?\s*([A-Z0-9\-_]{3,50})/i,
      // Colombian specific patterns
      /hacienda\s+([A-Z][A-Z0-9\s\-_]{3,50})/i,
      /finca\s+([A-Z][A-Z0-9\s\-_]{3,50})/i,
      /urbanización\s+([A-Z][A-Z0-9\s\-_]{3,50})/i,
      /conjunto\s+([A-Z][A-Z0-9\s\-_]{3,50})/i
    ];

    const phasePatterns = [
      /(etapa|fase|stage|phase)\s*:?\s*([0-9]+|[IVX]+|[A-Z])/i,
      /(torre|tower|bloque|block|modulo|module)\s*:?\s*([0-9A-Z]+)/i
    ];

    const locationPatterns = [
      /(hacienda|finca|urbanización|conjunto|edificio)\s+([A-Z][A-Z0-9\s]{2,50})/i,
      /(transversal|carrera|calle|avenida|diagonal)\s+([0-9]+[A-Z]?\s*[#]?\s*[0-9\-]+)/i
    ];

    for (const xpath of textFields) {
      try {
        const textNodes = this.evaluateXPath(doc, xpath);
        if (textNodes && textNodes.length > 0) {
          const textNode = textNodes[0] as Element;
          const textContent = textNode.textContent || '';
          
          // Check exact patterns first
          for (const pattern of exactPatterns) {
            const match = textContent.match(pattern);
            if (match && match[1]) {
              const projectName = match[1].trim();
              const projectPhase = this.extractPhaseFromText(textContent, phasePatterns);
              const projectAddress = this.extractAddressFromText(textContent, locationPatterns);
              const projectCity = this.extractCityFromText(textContent);
              
              // Enhanced Colombian project type detection
              const projectType = this.determineProjectType(projectName);
              const contractNumber = this.extractContractNumber(textContent);
              const orderNumber = this.extractOrderNumber(textContent);
              
              return this.createProjectResult({
                projectName,
                projectCode: null,
                projectAddress,
                projectCity,
                projectPhase,
                projectType,
                extractionMethod: 'text_content',
                confidence: 85,
                xmlPath: xpath,
                xmlElement: xpath.split('/').pop()?.replace('/text()', '') || '',
                extractedText: textContent,
                additionalInfo: {
                  workType: this.determineWorkType(textContent),
                  contractNumber,
                  orderNumber,
                  developmentStage: projectPhase,
                  location: projectCity,
                  xmlNamespace: null
                }
              });
            }
          }
        }
      } catch (error) {
        continue;
      }
    }

    return this.createDefaultResult('No text content patterns found', 0);
  }

  /**
   * Stage 3: Extract project info from line items and their descriptions
   */
  private async stage3LineItemAnalysis(doc: Document): Promise<ProjectExtractionResult> {
    const lineItemPaths = [
      '//lineItem//descripcion/text()',
      '//lineItem//description/text()',
      '//item//descripcion/text()',
      '//item//description/text()',
      '//detalle//descripcion/text()',
      '//detail//description/text()',
      '//producto//nombre/text()',
      '//product//name/text()',
      '//servicio//descripcion/text()',
      '//service//description/text()',
      // Colombian UBL specific paths
      '//cac:InvoiceLine//cbc:Description/text()',
      '//cac:InvoiceLine//cbc:Item/text()',
      '//cac:InvoiceLine//cac:Item//cbc:Description/text()'
    ];

    const projectPatterns = [
      /(proyecto|project|obra|development)\s*:?\s*([A-Z][A-Z0-9\s\-_]{3,50})/i,
      /(hacienda|finca|urbanización|conjunto)\s+([A-Z][A-Z0-9\s]{2,30})/i,
      /(etapa|fase|phase)\s+([0-9IVX]+)/i,
      /(torre|tower|bloque|block)\s+([0-9A-Z]+)/i,
      // Colombian specific line item patterns
      /(construcción|construction)\s+(?:de\s+)?([A-Z][A-Z0-9\s]{3,40})/i,
      /(instalación|installation)\s+(?:en\s+)?([A-Z][A-Z0-9\s]{3,40})/i
    ];

    let bestMatch: any = null;
    let highestConfidence = 0;

    for (const xpath of lineItemPaths) {
      try {
        const textNodes = this.evaluateXPath(doc, xpath);
        if (textNodes && textNodes.length > 0) {
          for (const textNode of textNodes) {
            const textContent = (textNode as Element).textContent || '';
            
            for (const pattern of projectPatterns) {
              const match = textContent.match(pattern);
              if (match && match[1] && match[2]) {
                const confidence = this.calculateLineItemConfidence(textContent, match);
                if (confidence > highestConfidence) {
                  highestConfidence = confidence;
                  bestMatch = {
                    projectName: match[2].trim(),
                    projectType: match[1].trim(),
                    textContent,
                    xpath,
                    confidence
                  };
                }
              }
            }
          }
        }
      } catch (error) {
        continue;
      }
    }

    if (bestMatch) {
      return this.createProjectResult({
        projectName: bestMatch.projectName,
        projectCode: null,
        projectAddress: null,
        projectCity: null,
        projectPhase: this.extractPhaseFromText(bestMatch.textContent),
        projectType: this.determineProjectType(bestMatch.projectName),
        extractionMethod: 'line_item',
        confidence: bestMatch.confidence,
        xmlPath: bestMatch.xpath,
        xmlElement: bestMatch.xpath.split('/').pop()?.replace('/text()', '') || '',
        extractedText: bestMatch.textContent,
        additionalInfo: {
          workType: this.determineWorkType(bestMatch.textContent),
          contractNumber: null,
          orderNumber: null,
          developmentStage: this.extractPhaseFromText(bestMatch.textContent),
          location: null,
          xmlNamespace: null
        }
      });
    }

    return this.createDefaultResult('No line item patterns found', 0);
  }

  /**
   * Stage 4: Analyze address fields for project location clues
   */
  private async stage4AddressContextAnalysis(doc: Document): Promise<ProjectExtractionResult> {
    const addressPaths = [
      '//direccion/text()',
      '//address/text()',
      '//direccionEntrega/text()',
      '//deliveryAddress/text()',
      '//direccionProyecto/text()',
      '//projectAddress/text()',
      '//ubicacion/text()',
      '//location/text()',
      '//sitio/text()',
      '//site/text()',
      '//ciudad/text()',
      '//city/text()',
      '//municipio/text()',
      '//municipality/text()',
      '//departamento/text()',
      '//state/text()',
      // Colombian UBL specific address paths
      '//cac:DeliveryAddress//cbc:StreetName/text()',
      '//cac:DeliveryAddress//cbc:CityName/text()',
      '//cac:DeliveryAddress//cbc:CountrySubentity/text()',
      '//cac:AccountingCustomerParty//cac:PostalAddress//cbc:StreetName/text()',
      '//cac:AccountingCustomerParty//cac:PostalAddress//cbc:CityName/text()'
    ];

    const addressPatterns = [
      /(proyecto|obra|desarrollo|construcción)\s+([A-Z][A-Z0-9\s]{5,100})/i,
      /(hacienda|finca|urbanización|conjunto|edificio|torre)\s+([A-Z][A-Z0-9\s]{3,50})/i,
      /(etapa|fase|stage|phase)\s+([0-9IVX]+)/i,
      // Colombian address patterns
      /(transversal|carrera|calle|avenida|diagonal)\s+([0-9]+[A-Z]?\s*[#]?\s*[0-9\-]+)/i,
      /(barrio|neighborhood)\s+([A-Z][A-Z0-9\s]{2,30})/i
    ];

    for (const xpath of addressPaths) {
      try {
        const textNodes = this.evaluateXPath(doc, xpath);
        if (textNodes && textNodes.length > 0) {
          const textNode = textNodes[0] as Element;
          const textContent = textNode.textContent || '';
          
          for (const pattern of addressPatterns) {
            const match = textContent.match(pattern);
            if (match && match[1] && match[2]) {
              const projectName = match[2].trim();
              const projectAddress = textContent;
              const projectCity = this.extractCityFromText(textContent);
              
              return this.createProjectResult({
                projectName,
                projectCode: null,
                projectAddress,
                projectCity,
                projectPhase: this.extractPhaseFromText(textContent),
                projectType: this.determineProjectType(projectName),
                extractionMethod: 'address_context',
                confidence: 75,
                xmlPath: xpath,
                xmlElement: xpath.split('/').pop()?.replace('/text()', '') || '',
                extractedText: textContent,
                additionalInfo: {
                  workType: null,
                  contractNumber: null,
                  orderNumber: null,
                  developmentStage: this.extractPhaseFromText(textContent),
                  location: projectCity,
                  xmlNamespace: null
                }
              });
            }
          }
        }
      } catch (error) {
        continue;
      }
    }

    return this.createDefaultResult('No address context patterns found', 0);
  }

  /**
   * Stage 5: Search all XML attributes for project references
   */
  private async stage5XMLAttributeMining(doc: Document): Promise<ProjectExtractionResult> {
    const attributePatterns = [
      /proyecto/i,
      /project/i,
      /obra/i,
      /codigo/i,
      /code/i,
      /ref/i,
      /referencia/i,
      /etapa/i,
      /phase/i,
      /ubicacion/i,
      /location/i
    ];

    try {
      const allElements = doc.getElementsByTagName('*');
      
      for (let i = 0; i < allElements.length; i++) {
        const element = allElements[i] as Element;
        const attributes = element.attributes;
        
        for (let j = 0; j < attributes.length; j++) {
          const attr = attributes[j];
          const attrName = attr.name.toLowerCase();
          const attrValue = attr.value;
          
          // Check if attribute name contains project-related keywords
          for (const pattern of attributePatterns) {
            if (pattern.test(attrName) && attrValue && attrValue.length >= 3) {
              return this.createProjectResult({
                projectName: attrValue,
                projectCode: null,
                projectAddress: null,
                projectCity: null,
                projectPhase: null,
                projectType: this.determineProjectType(attrValue),
                extractionMethod: 'xml_attribute',
                confidence: 60,
                xmlPath: `//${element.nodeName}[@${attr.name}]`,
                xmlElement: element.nodeName,
                extractedText: attrValue,
                additionalInfo: {
                  workType: null,
                  contractNumber: null,
                  orderNumber: null,
                  developmentStage: null,
                  location: null,
                  xmlNamespace: this.getNamespace(element)
                }
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in attribute mining:', error);
    }

    return this.createDefaultResult('No attribute patterns found', 0);
  }

  /**
   * Enhanced helper methods for Colombian XML specifics
   */
  private evaluateXPath(doc: Document, xpath: string): Node[] | null {
    try {
      // Simplified XPath evaluation using basic DOM methods available in @xmldom/xmldom
      if (xpath.includes('/text()')) {
        const elementPath = xpath.replace('/text()', '');
        
        // Handle namespaced elements
        if (elementPath.includes(':')) {
          // Remove the // prefix before splitting
          const cleanPath = elementPath.replace('//', '');
          // Extract just the element name, removing predicates
          const elementName = cleanPath.split('[')[0];
          const [prefix, localName] = elementName.split(':');
          
          const namespace = this.commonNamespaces.get(prefix);
          
          if (namespace) {
            // Use enhanced UBL method for better namespace handling
            return this.findUBLElements(doc, localName);
          } else {
            // Try to find elements even without namespace
            return this.findUBLElements(doc, localName);
          }
        }
        // Fallback to getElementsByTagName
        const tagName = elementPath.replace('//', '');
        
        if (tagName === '*') {
          const allElements = doc.getElementsByTagName('*');
          return Array.from(allElements);
        } else {
          const elements = doc.getElementsByTagName(tagName);
          return Array.from(elements);
        }
      } else if (xpath.startsWith('//@')) {
        const attrName = xpath.substring(3);
        // Find all elements with this attribute
        const allElements = doc.getElementsByTagName('*');
        const matchingElements = [];
        for (let i = 0; i < allElements.length; i++) {
          const element = allElements[i] as Element;
          if (element.hasAttribute(attrName)) {
            matchingElements.push(element);
          }
        }
        return matchingElements;
      } else {
        // Handle namespaced elements
        if (xpath.includes(':')) {
          // Remove the // prefix before splitting
          const cleanPath = xpath.replace('//', '');
          // Extract just the element name, removing predicates
          const elementName = cleanPath.split('[')[0];
          const [prefix, localName] = elementName.split(':');
          const namespace = this.commonNamespaces.get(prefix);
          if (namespace) {
            // Use enhanced UBL method for better namespace handling
            return this.findUBLElements(doc, localName);
          }
        }
        // Use getElementsByTagName for simple paths
        const tagName = xpath.replace('//', '');
        if (tagName === '*') {
          const allElements = doc.getElementsByTagName('*');
          return Array.from(allElements);
        } else {
          const elements = doc.getElementsByTagName(tagName);
          return Array.from(elements);
        }
      }
    } catch (error) {
      console.error('XPath evaluation error:', error);
      return null;
    }
  }

  /**
   * Enhanced method to find elements by local name (ignoring namespace)
   */
  private findElementsByLocalName(doc: Document, localName: string): Element[] {
    const allElements = doc.getElementsByTagName('*');
    const matchingElements = [];
    for (let i = 0; i < allElements.length; i++) {
      const element = allElements[i] as Element;
      // Check both localName and nodeName for compatibility
      if (element.localName === localName || 
          element.nodeName === localName || 
          element.nodeName.endsWith(`:${localName}`)) {
        matchingElements.push(element);
      }
    }
    return matchingElements;
  }

  /**
   * Enhanced method to find UBL elements with better namespace handling
   */
  private findUBLElements(doc: Document, localName: string): Element[] {
    const allElements = doc.getElementsByTagName('*');
    const matchingElements = [];
    
    for (let i = 0; i < allElements.length; i++) {
      const element = allElements[i] as Element;
      const nodeName = element.nodeName;
      
      // Check multiple patterns for UBL elements
      if (nodeName === localName || // Exact match
          nodeName === `cbc:${localName}` || // cbc namespace
          nodeName === `cac:${localName}` || // cac namespace
          nodeName === `ext:${localName}` || // ext namespace
          nodeName.endsWith(`:${localName}`) || // Any namespace ending with localName
          element.localName === localName) { // localName property
        matchingElements.push(element);
      }
    }
    
    return matchingElements;
  }

  private getTextContent(element: Element): string {
    return element.textContent || '';
  }

  private getNamespace(element: Element): string | null {
    try {
      return element.namespaceURI;
    } catch (error) {
      return null;
    }
  }

  private extractProjectCode(element: Element): string | null {
    const codeAttrs = ['codigo', 'code', 'id', 'ref'];
    for (const attr of codeAttrs) {
      const value = element.getAttribute(attr);
      if (value && value.length >= 2) {
        return value;
      }
    }
    return null;
  }

  private extractProjectPhase(element: Element): string | null {
    const phaseAttrs = ['etapa', 'phase', 'fase'];
    for (const attr of phaseAttrs) {
      const value = element.getAttribute(attr);
      if (value && value.length >= 1) {
        return value;
      }
    }
    return null;
  }

  private determineProjectType(text: string): string | null {
    const typePatterns = [
      { pattern: /hacienda/i, type: 'HACIENDA' },
      { pattern: /finca/i, type: 'FINCA' },
      { pattern: /urbanización|urbanizacion/i, type: 'URBANIZACIÓN' },
      { pattern: /conjunto/i, type: 'CONJUNTO' },
      { pattern: /edificio/i, type: 'EDIFICIO' },
      { pattern: /torre/i, type: 'TORRE' },
      { pattern: /parque/i, type: 'PARQUE' },
      { pattern: /residencial/i, type: 'RESIDENCIAL' },
      { pattern: /comercial/i, type: 'COMERCIAL' },
      { pattern: /industrial/i, type: 'INDUSTRIAL' }
    ];

    for (const { pattern, type } of typePatterns) {
      if (pattern.test(text)) {
        return type;
      }
    }
    return null;
  }

  private determineWorkType(text: string): string | null {
    const workPatterns = [
      { pattern: /construcción|construction/i, type: 'CONSTRUCCIÓN' },
      { pattern: /instalación|installation/i, type: 'INSTALACIÓN' },
      { pattern: /mantenimiento|maintenance/i, type: 'MANTENIMIENTO' },
      { pattern: /reparación|repair/i, type: 'REPARACIÓN' },
      { pattern: /diseño|design/i, type: 'DISEÑO' },
      { pattern: /supervisión|supervision/i, type: 'SUPERVISIÓN' }
    ];

    for (const { pattern, type } of workPatterns) {
      if (pattern.test(text)) {
        return type;
      }
    }
    return null;
  }

  private extractContractNumber(text: string): string | null {
    const contractPatterns = [
      /contrato\s+(?:no\.?|num\.?|#)?\s*([A-Z0-9\-]{3,20})/i,
      /contract\s+(?:no\.?|num\.?|#)?\s*([A-Z0-9\-]{3,20})/i
    ];

    for (const pattern of contractPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return null;
  }

  private extractOrderNumber(text: string): string | null {
    const orderPatterns = [
      /orden\s+(?:no\.?|num\.?|#)?\s*([A-Z0-9\-]{3,20})/i,
      /order\s+(?:no\.?|num\.?|#)?\s*([A-Z0-9\-]{3,20})/i
    ];

    for (const pattern of orderPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return null;
  }

  private extractPhaseFromText(text: string, patterns?: RegExp[]): string | null {
    const defaultPatterns = [
      /(etapa|fase|phase)\s*:?\s*([0-9]+|[IVX]+|[A-Z])/i,
      /(torre|tower|bloque|block)\s*:?\s*([0-9A-Z]+)/i
    ];

    const phasePatterns = patterns || defaultPatterns;
    
    for (const pattern of phasePatterns) {
      const match = text.match(pattern);
      if (match && match[2]) {
        return match[2].trim();
      }
    }
    return null;
  }

  private extractAddressFromText(text: string, patterns: RegExp[]): string | null {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[0]) {
        return match[0].trim();
      }
    }
    return null;
  }

  private extractCityFromText(text: string): string | null {
    const cityPatterns = [
      /(?:en|ubicado en|situado en)\s+([A-ZÁÉÍÓÚÑ]+(?:\s+[A-ZÁÉÍÓÚÑ]+)*)/i,
      /(?:ciudad|city)\s+([A-ZÁÉÍÓÚÑ]+(?:\s+[A-ZÁÉÍÓÚÑ]+)*)/i,
      /(?:municipio|municipality)\s+([A-ZÁÉÍÓÚÑ]+(?:\s+[A-ZÁÉÍÓÚÑ]+)*)/i
    ];

    for (const pattern of cityPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return null;
  }

  private calculateLineItemConfidence(text: string, match: RegExpMatchArray): number {
    let confidence = 70;
    
    // Higher confidence for longer, more specific project names
    if (match[2].length > 10) confidence += 10;
    if (match[2].length > 20) confidence += 5;
    
    // Higher confidence for specific project types
    if (/hacienda|finca|urbanización|conjunto/i.test(match[1])) confidence += 10;
    
    // Higher confidence for phase/etapa information
    if (/(etapa|fase|phase)/i.test(text)) confidence += 5;
    
    // Higher confidence for Colombian specific terms
    if (/transversal|carrera|calle|avenida|diagonal/i.test(text)) confidence += 5;
    
    return Math.min(confidence, 95);
  }

  private createProjectResult(data: Partial<ProjectExtractionResult>): ProjectExtractionResult {
    return {
      projectName: data.projectName || null,
      projectCode: data.projectCode || null,
      projectAddress: data.projectAddress || null,
      projectCity: data.projectCity || null,
      projectPhase: data.projectPhase || null,
      projectType: data.projectType || null,
      extractionMethod: data.extractionMethod || 'text_content',
      confidence: data.confidence || 0,
      xmlPath: data.xmlPath || '',
      xmlElement: data.xmlElement || '',
      extractedText: data.extractedText || '',
      additionalInfo: data.additionalInfo || {
        workType: null,
        contractNumber: null,
        orderNumber: null,
        developmentStage: data.projectPhase || null,
        location: data.projectCity || null,
        xmlNamespace: null
      }
    };
  }

  private createDefaultResult(message: string, confidence: number): ProjectExtractionResult {
    return {
      projectName: null,
      projectCode: null,
      projectAddress: null,
      projectCity: null,
      projectPhase: null,
      projectType: null,
      extractionMethod: 'text_content',
      confidence,
      xmlPath: '',
      xmlElement: '',
      extractedText: message,
      additionalInfo: {
        workType: null,
        contractNumber: null,
        orderNumber: null,
        developmentStage: null,
        location: null,
        xmlNamespace: null
      }
    };
  }
}
