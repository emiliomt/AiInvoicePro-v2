import OpenAI from "openai";
import { Invoice, Project, InsertInvoiceProjectMatch } from "../shared/schema.js";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ProjectMatchResult {
  project: Project;
  matchScore: number;
  matchDetails: {
    addressSimilarity: number;
    citySimilarity: number;
    projectNameSimilarity: number;
    overallConfidence: number;
    matchedFields: string[];
    reasons: string[];
  };
}

export interface InvoiceData {
  extractedData?: {
    projectName?: string;
    address?: string;
    city?: string;
    vendorName?: string;
  };
  projectName?: string;
  vendorName?: string;
}

export class ProjectMatcherService {
  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    if (s1 === s2) return 100;
    
    const distance = this.levenshteinDistance(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);
    
    if (maxLength === 0) return 100;
    
    return Math.round(((maxLength - distance) / maxLength) * 100);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Use AI to enhance matching logic with semantic understanding
   */
  private async enhanceMatchingWithAI(
    invoiceData: InvoiceData,
    project: Project,
    basicMatch: ProjectMatchResult
  ): Promise<ProjectMatchResult> {
    try {
      const prompt = `
        Analyze the similarity between this invoice data and project information for better matching:

        Invoice Data:
        - Project Name: ${invoiceData.extractedData?.projectName || invoiceData.projectName || 'N/A'}
        - Project Address: ${invoiceData.extractedData?.projectAddress || 'N/A'}
        - Address: ${invoiceData.extractedData?.address || 'N/A'}
        - Project City: ${invoiceData.extractedData?.projectCity || 'N/A'}
        - City: ${invoiceData.extractedData?.city || 'N/A'}
        - Vendor Address: ${invoiceData.extractedData?.vendorAddress || 'N/A'}
        - Vendor: ${invoiceData.extractedData?.vendorName || invoiceData.vendorName || 'N/A'}

        Project Information:
        - Project Name: ${project.name}
        - Address: ${project.address || 'N/A'}
        - City: ${project.city || 'N/A'}
        - Project ID: ${project.projectId}

        Current Basic Match Score: ${basicMatch.matchScore}%

        Please analyze and provide:
        1. Enhanced match confidence (0-100)
        2. Specific reasons for the match or mismatch
        3. Consider common variations, abbreviations, and alternative spellings
        4. Account for partial address matches and geographic proximity

        Respond with JSON in this format:
        {
          "enhancedScore": number,
          "confidence": number,
          "reasons": ["reason1", "reason2"],
          "semanticMatches": ["field1", "field2"]
        }
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert at matching invoice data with project information. Analyze semantic similarity and provide accurate matching scores."
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 500,
      });

      const aiResult = JSON.parse(response.choices[0].message.content || '{}');
      
      // Combine AI results with basic matching
      const enhancedMatchDetails = {
        ...basicMatch.matchDetails,
        overallConfidence: Math.max(basicMatch.matchScore, aiResult.enhancedScore || basicMatch.matchScore),
        reasons: [...basicMatch.matchDetails.reasons, ...(aiResult.reasons || [])],
        matchedFields: [...basicMatch.matchDetails.matchedFields, ...(aiResult.semanticMatches || [])]
      };

      return {
        ...basicMatch,
        matchScore: Math.max(basicMatch.matchScore, aiResult.enhancedScore || basicMatch.matchScore),
        matchDetails: enhancedMatchDetails
      };

    } catch (error) {
      console.error("AI matching enhancement failed:", error);
      // Return basic match if AI fails
      return basicMatch;
    }
  }

  /**
   * Match invoice with projects using both fuzzy logic and AI
   */
  async matchInvoiceWithProjects(
    invoice: Invoice,
    projects: Project[]
  ): Promise<ProjectMatchResult[]> {
    const invoiceData: InvoiceData = {
      extractedData: invoice.extractedData as any,
      projectName: invoice.projectName || undefined,
      vendorName: invoice.vendorName || undefined,
    };

    const matches: ProjectMatchResult[] = [];

    for (const project of projects) {
      // Basic fuzzy matching
      const basicMatch = await this.performBasicMatching(invoiceData, project);
      
      // Enhance with AI if basic score is promising (>30%) or if we have good data
      let finalMatch = basicMatch;
      if (basicMatch.matchScore > 30 || this.hasGoodMatchingData(invoiceData)) {
        finalMatch = await this.enhanceMatchingWithAI(invoiceData, project, basicMatch);
      }

      if (finalMatch.matchScore > 0) {
        matches.push(finalMatch);
      }
    }

    // Sort by match score descending
    return matches.sort((a, b) => b.matchScore - a.matchScore);
  }

  private hasGoodMatchingData(invoiceData: InvoiceData): boolean {
    const hasProjectName = !!(invoiceData.extractedData?.projectName || invoiceData.projectName);
    const hasAddress = !!invoiceData.extractedData?.address;
    const hasCity = !!invoiceData.extractedData?.city;
    
    return hasProjectName || (hasAddress && hasCity);
  }

  private async performBasicMatching(
    invoiceData: InvoiceData,
    project: Project
  ): Promise<ProjectMatchResult> {
    const matchDetails = {
      addressSimilarity: 0,
      citySimilarity: 0,
      projectNameSimilarity: 0,
      overallConfidence: 0,
      matchedFields: [] as string[],
      reasons: [] as string[]
    };

    // Project name matching
    const invoiceProjectName = invoiceData.extractedData?.projectName || invoiceData.projectName;
    if (invoiceProjectName && project.name) {
      matchDetails.projectNameSimilarity = this.calculateStringSimilarity(invoiceProjectName, project.name);
      if (matchDetails.projectNameSimilarity > 70) {
        matchDetails.matchedFields.push('projectName');
        matchDetails.reasons.push(`Project name similarity: ${matchDetails.projectNameSimilarity}%`);
      }
    }

    // Address matching - use projectAddress if available, otherwise fall back to address
    const invoiceAddress = invoiceData.extractedData?.projectAddress || invoiceData.extractedData?.address;
    if (invoiceAddress && project.address) {
      matchDetails.addressSimilarity = this.calculateStringSimilarity(invoiceAddress, project.address);
      if (matchDetails.addressSimilarity > 60) {
        matchDetails.matchedFields.push('address');
        matchDetails.reasons.push(`Address similarity: ${matchDetails.addressSimilarity}%`);
      }
    }

    // City matching - use projectCity if available, otherwise derive from vendor address
    let invoiceCity = invoiceData.extractedData?.projectCity || invoiceData.extractedData?.city;
    
    // If no explicit project city, try to extract from vendor address
    if (!invoiceCity && invoiceData.extractedData?.vendorAddress) {
      const vendorAddress = invoiceData.extractedData.vendorAddress;
      // Extract city from vendor address (e.g., "CRA 64 N79 117, BARRANQUILLA, ATLANTICO, COLOMBIA")
      const addressParts = vendorAddress.split(',').map(part => part.trim());
      if (addressParts.length >= 2) {
        invoiceCity = addressParts.slice(1).join(', '); // Take everything after the first comma
      }
    }
    
    if (invoiceCity && project.city) {
      matchDetails.citySimilarity = this.calculateStringSimilarity(invoiceCity, project.city);
      if (matchDetails.citySimilarity > 80) {
        matchDetails.matchedFields.push('city');
        matchDetails.reasons.push(`City match: ${matchDetails.citySimilarity}%`);
      }
    }

    // Calculate overall match score with weighted importance
    const weights = {
      projectName: 0.5,  // 50% weight
      address: 0.3,      // 30% weight
      city: 0.2          // 20% weight
    };

    let weightedScore = 0;
    let totalWeight = 0;

    if (matchDetails.projectNameSimilarity > 0) {
      weightedScore += matchDetails.projectNameSimilarity * weights.projectName;
      totalWeight += weights.projectName;
    }
    if (matchDetails.addressSimilarity > 0) {
      weightedScore += matchDetails.addressSimilarity * weights.address;
      totalWeight += weights.address;
    }
    if (matchDetails.citySimilarity > 0) {
      weightedScore += matchDetails.citySimilarity * weights.city;
      totalWeight += weights.city;
    }

    const matchScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
    matchDetails.overallConfidence = matchScore;

    return {
      project,
      matchScore,
      matchDetails
    };
  }

  /**
   * Create invoice-project match record
   */
  async createInvoiceProjectMatch(
    invoiceId: number,
    projectMatch: ProjectMatchResult,
    status: 'auto' | 'manual' | 'unresolved' = 'auto'
  ): Promise<InsertInvoiceProjectMatch> {
    return {
      invoiceId,
      projectId: projectMatch.project.projectId,
      matchScore: projectMatch.matchScore.toString(),
      status,
      matchDetails: projectMatch.matchDetails,
      isActive: true
    };
  }
}

export const projectMatcher = new ProjectMatcherService();