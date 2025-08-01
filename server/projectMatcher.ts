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
    projectAddress?: string;
    projectCity?: string;
    address?: string;
    city?: string;
    vendorName?: string;
    vendorAddress?: string;
    buyerAddress?: string;
    concept?: string;
    notes?: string;
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
    console.log(`🎯 Starting project matching for invoice ${invoice.id} (${invoice.fileName || 'unknown'})`);
    console.log(`📊 Found ${projects.length} validation criteria projects to match against`);
    
    const invoiceData: InvoiceData = {
      extractedData: invoice.extractedData as any,
      projectName: invoice.projectName || undefined,
      vendorName: invoice.vendorName || undefined,
    };

    // Log invoice data for debugging
    const extractedData = invoiceData.extractedData;
    console.log(`📍 Invoice matching data:`);
    console.log(`  - Project Name: "${extractedData?.projectName || extractedData?.concept || extractedData?.notes || 'N/A'}"`);
    console.log(`  - Address: "${extractedData?.projectAddress || extractedData?.address || extractedData?.vendorAddress || extractedData?.buyerAddress || 'N/A'}"`);
    console.log(`  - City: "${extractedData?.projectCity || extractedData?.city || 'N/A'}"`);

    const matches: ProjectMatchResult[] = [];

    for (const project of projects) {
      // Ensure we're working with real validation criteria projects
      if (!project.projectId || !project.name) {
        console.log(`  ⚠️ Skipping invalid project: ${project.name || 'unnamed'}`);
        continue;
      }
      
      // Basic fuzzy matching with real projects
      const basicMatch = await this.performBasicMatching(invoiceData, project);
      
      // Only use AI enhancement for promising matches to avoid false positives
      let finalMatch = basicMatch;
      if (basicMatch.matchScore >= 40 && this.hasGoodMatchingData(invoiceData)) {
        try {
          finalMatch = await this.enhanceMatchingWithAI(invoiceData, project, basicMatch);
        } catch (error) {
          console.log(`  ⚠️ AI enhancement failed for ${project.name}, using basic match`);
          finalMatch = basicMatch;
        }
      }

      // Only include matches above minimum threshold (50%)
      if (finalMatch.matchScore >= 50) {
        matches.push(finalMatch);
      }
    }

    console.log(`📋 Found ${matches.length} valid project matches (≥50% confidence)`);
    if (matches.length > 0) {
      console.log(`🏆 Best match: ${matches[0]?.project.name} (${matches[0]?.matchScore}%)`);
    } else {
      console.log(`❌ No suitable project matches found above 50% threshold`);
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
    console.log(`\n🔍 Evaluating project: ${project.name} (${project.city})`);
    
    const matchDetails = {
      addressSimilarity: 0,
      citySimilarity: 0,
      projectNameSimilarity: 0,
      overallConfidence: 0,
      matchedFields: [] as string[],
      reasons: [] as string[]
    };

    // Project name matching - check multiple sources
    const invoiceProjectName = invoiceData.extractedData?.projectName || 
                              invoiceData.projectName || 
                              invoiceData.extractedData?.concept || 
                              invoiceData.extractedData?.notes;
                              
    if (invoiceProjectName && project.name) {
      matchDetails.projectNameSimilarity = this.calculateStringSimilarity(invoiceProjectName, project.name);
      console.log(`  Name comparison: "${invoiceProjectName}" vs "${project.name}" = ${matchDetails.projectNameSimilarity}%`);
      
      if (matchDetails.projectNameSimilarity > 40) { // Lowered threshold for better matching
        matchDetails.matchedFields.push('projectName');
        matchDetails.reasons.push(`Project name similarity: ${matchDetails.projectNameSimilarity}%`);
      }
    }

    // Address matching - try multiple address sources
    const invoiceAddress = invoiceData.extractedData?.projectAddress || 
                          invoiceData.extractedData?.address || 
                          invoiceData.extractedData?.vendorAddress || 
                          invoiceData.extractedData?.buyerAddress;
                          
    if (invoiceAddress && project.address) {
      matchDetails.addressSimilarity = this.calculateStringSimilarity(invoiceAddress, project.address);
      console.log(`  Address comparison: "${invoiceAddress}" vs "${project.address}" = ${matchDetails.addressSimilarity}%`);
      
      if (matchDetails.addressSimilarity > 30) { // Lowered threshold for better matching
        matchDetails.matchedFields.push('address');
        matchDetails.reasons.push(`Address similarity: ${matchDetails.addressSimilarity}%`);
      }
    }

    // City matching - use projectCity if available, otherwise derive from vendor address
    let invoiceCity = invoiceData.extractedData?.projectCity || invoiceData.extractedData?.city;
    
    // If no explicit project city, try to extract from vendor address or buyer address
    if (!invoiceCity && (invoiceData.extractedData?.vendorAddress || invoiceData.extractedData?.buyerAddress)) {
      const address = invoiceData.extractedData?.vendorAddress || invoiceData.extractedData?.buyerAddress;
      if (address) {
        // Extract city from Colombian address format (e.g., "CARTAGENA, BOLIVAR, 130111")
        const addressParts = address.split(',').map((part: string) => part.trim());
        if (addressParts.length >= 1) {
          invoiceCity = addressParts[0]; // Take the first part as the city
        }
      }
    }
    
    if (invoiceCity && project.city) {
      matchDetails.citySimilarity = this.calculateStringSimilarity(invoiceCity, project.city);
      console.log(`  City comparison: "${invoiceCity}" vs "${project.city}" = ${matchDetails.citySimilarity}%`);
      
      // Exact city match gets full score
      if (invoiceCity.toLowerCase().trim() === project.city.toLowerCase().trim()) {
        matchDetails.citySimilarity = 100;
        matchDetails.matchedFields.push('city');
        matchDetails.reasons.push(`City exact match: ${project.city}`);
      } else if (matchDetails.citySimilarity > 60) { // Lowered threshold for partial matches
        matchDetails.matchedFields.push('city');
        matchDetails.reasons.push(`City similarity: ${matchDetails.citySimilarity}%`);
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

    console.log(`  Final match score: ${matchScore}% (weighted from ${matchDetails.matchedFields.length} fields)`);
    
    // Apply minimum threshold of 50% for valid matches
    if (matchScore < 50) {
      console.log(`  ❌ Below minimum threshold (50%), rejecting match`);
      return {
        project,
        matchScore: 0,
        matchDetails: {
          ...matchDetails,
          overallConfidence: 0,
          reasons: [`Match score ${matchScore}% below minimum threshold (50%)`]
        }
      };
    }

    console.log(`  ✅ Valid match found: ${matchScore}%`);
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