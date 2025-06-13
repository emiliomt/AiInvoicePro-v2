import OpenAI from "openai";
import { Invoice, Project, InsertInvoice } from "../../shared/schema.js";
import { storage } from "../storage.js";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ProjectMatchResult {
  project: Project;
  matchScore: number;
  matchReason: string;
  matchDetails: {
    projectNameMatch?: number;
    addressMatch?: number;
    taxIdMatch?: number;
    cityMatch?: number;
    overallConfidence: number;
  };
}

export interface PettyCashCheckResult {
  isPettyCash: boolean;
  threshold: number;
  amount: number;
  reason: string;
}

export class ProjectMatchingService {
  /**
   * Step 1: Check if invoice qualifies as petty cash
   */
  async checkPettyCash(invoice: Invoice): Promise<PettyCashCheckResult> {
    // Get petty cash threshold from settings
    const thresholdSetting = await storage.getSetting("petty_cash_threshold");
    const threshold = parseFloat(thresholdSetting?.value || "100"); // Default $100
    
    const amount = parseFloat(invoice.totalAmount || "0");
    const isPettyCash = amount <= threshold;
    
    return {
      isPettyCash,
      threshold,
      amount,
      reason: isPettyCash 
        ? `Invoice amount $${amount} is below petty cash threshold $${threshold}`
        : `Invoice amount $${amount} exceeds petty cash threshold $${threshold}, proceeding to project matching`
    };
  }

  /**
   * Step 2: AI-powered project matching
   */
  async findProjectMatches(invoice: Invoice): Promise<ProjectMatchResult[]> {
    // Get all validated projects
    const projects = await storage.getProjects();
    const validatedProjects = projects.filter(p => p.isValidated);
    
    if (validatedProjects.length === 0) {
      return [];
    }

    // Extract relevant invoice data for matching
    const invoiceData = this.extractInvoiceMatchingData(invoice);
    
    // Use AI to analyze and score each project
    const matchResults: ProjectMatchResult[] = [];
    
    for (const project of validatedProjects) {
      try {
        const matchResult = await this.analyzeProjectMatch(invoiceData, project);
        if (matchResult.matchScore > 0) {
          matchResults.push(matchResult);
        }
      } catch (error) {
        console.error(`Error matching project ${project.projectId}:`, error);
      }
    }

    // Sort by match score descending and return top 3
    return matchResults
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 3);
  }

  /**
   * Step 3: Auto-assign project if confidence threshold is met
   */
  async autoAssignProject(invoice: Invoice, matches: ProjectMatchResult[]): Promise<{
    autoAssigned: boolean;
    assignedProject?: Project;
    matchScore?: number;
    reason: string;
  }> {
    if (matches.length === 0) {
      return {
        autoAssigned: false,
        reason: "No project matches found"
      };
    }

    // Get auto-assignment threshold from settings
    const thresholdSetting = await storage.getSetting("auto_match_threshold");
    const threshold = parseFloat(thresholdSetting?.value || "85"); // Default 85%
    
    const bestMatch = matches[0];
    
    if (bestMatch.matchScore >= threshold) {
      // Auto-assign the project
      await storage.updateInvoice(invoice.id, {
        matchedProjectId: bestMatch.project.projectId,
        matchScore: bestMatch.matchScore.toString(),
        matchStatus: "auto_matched",
        matchedBy: "ai"
      });

      return {
        autoAssigned: true,
        assignedProject: bestMatch.project,
        matchScore: bestMatch.matchScore,
        reason: `Auto-assigned to ${bestMatch.project.name} with ${bestMatch.matchScore.toFixed(1)}% confidence (threshold: ${threshold}%)`
      };
    }

    return {
      autoAssigned: false,
      reason: `Best match score ${bestMatch.matchScore.toFixed(1)}% below auto-assignment threshold ${threshold}%`
    };
  }

  /**
   * Manual project assignment by user
   */
  async assignProjectManually(invoiceId: number, projectId: string, matchScore?: number): Promise<void> {
    await storage.updateInvoice(invoiceId, {
      matchedProjectId: projectId,
      matchScore: matchScore?.toString() || "0",
      matchStatus: "manual_match",
      matchedBy: "user"
    });
  }

  /**
   * Mark invoice as having no project match
   */
  async markNoMatch(invoiceId: number): Promise<void> {
    await storage.updateInvoice(invoiceId, {
      matchedProjectId: null,
      matchScore: "0",
      matchStatus: "no_match",
      matchedBy: "user"
    });
  }

  /**
   * Extract relevant data from invoice for matching
   */
  private extractInvoiceMatchingData(invoice: Invoice) {
    const extractedData = invoice.extractedData as any;
    return {
      vendorName: invoice.vendorName || extractedData?.vendorName || "",
      projectName: invoice.projectName || extractedData?.projectName || "",
      vendorAddress: extractedData?.vendorAddress || "",
      projectAddress: extractedData?.projectAddress || "",
      projectCity: extractedData?.projectCity || "",
      taxId: extractedData?.taxId || "",
      buyerTaxId: extractedData?.buyerTaxId || "",
      concept: extractedData?.concept || "",
      descriptionSummary: extractedData?.descriptionSummary || "",
      totalAmount: parseFloat(invoice.totalAmount || "0"),
      currency: invoice.currency || "USD"
    };
  }

  /**
   * Use AI to analyze project match
   */
  private async analyzeProjectMatch(invoiceData: any, project: Project): Promise<ProjectMatchResult> {
    const prompt = `
You are an expert at matching invoices to construction projects. Analyze how well this invoice matches the given project.

INVOICE DATA:
- Vendor: ${invoiceData.vendorName}
- Project Name: ${invoiceData.projectName}
- Vendor Address: ${invoiceData.vendorAddress}
- Project Address: ${invoiceData.projectAddress}
- Project City: ${invoiceData.projectCity}
- Tax ID: ${invoiceData.taxId}
- Buyer Tax ID: ${invoiceData.buyerTaxId}
- Concept: ${invoiceData.concept}
- Description: ${invoiceData.descriptionSummary}
- Amount: ${invoiceData.currency} ${invoiceData.totalAmount}

PROJECT DATA:
- Name: ${project.name}
- Description: ${project.description || ""}
- Location: ${project.city || project.address || ""}
- Budget: ${project.budget || ""} ${project.currency || ""}
- Status: ${project.status}

Analyze the match considering:
1. Project name similarity (exact, partial, or contextual match)
2. Location/address proximity (city, region, specific address)
3. Tax ID correlation (vendor vs project client)
4. Description/concept relevance to project type
5. Budget/amount reasonableness

Respond with JSON in this exact format:
{
  "matchScore": number (0-100),
  "matchReason": "brief explanation of the match",
  "projectNameMatch": number (0-100),
  "addressMatch": number (0-100), 
  "taxIdMatch": number (0-100),
  "cityMatch": number (0-100),
  "overallConfidence": number (0-100)
}
`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        project,
        matchScore: Math.max(0, Math.min(100, result.matchScore || 0)),
        matchReason: result.matchReason || "AI analysis completed",
        matchDetails: {
          projectNameMatch: result.projectNameMatch || 0,
          addressMatch: result.addressMatch || 0,
          taxIdMatch: result.taxIdMatch || 0,
          cityMatch: result.cityMatch || 0,
          overallConfidence: result.overallConfidence || result.matchScore || 0
        }
      };
    } catch (error) {
      console.error("AI project matching failed:", error);
      
      // Fallback to simple string matching
      return this.fallbackStringMatch(invoiceData, project);
    }
  }

  /**
   * Fallback string matching if AI fails
   */
  private fallbackStringMatch(invoiceData: any, project: Project): ProjectMatchResult {
    let score = 0;
    let matches = 0;
    let total = 0;

    // Project name matching
    if (invoiceData.projectName && project.name) {
      total++;
      const similarity = this.calculateStringSimilarity(
        invoiceData.projectName.toLowerCase(),
        project.name.toLowerCase()
      );
      if (similarity > 0.7) {
        score += similarity * 40; // Project name is most important
        matches++;
      }
    }

    // Location matching
    if (invoiceData.projectCity && (project.city || project.address)) {
      total++;
      const projectLocation = project.city || project.address || "";
      const similarity = this.calculateStringSimilarity(
        invoiceData.projectCity.toLowerCase(),
        projectLocation.toLowerCase()
      );
      if (similarity > 0.6) {
        score += similarity * 30;
        matches++;
      }
    }

    // Description matching
    if (invoiceData.concept && project.description) {
      total++;
      const similarity = this.calculateStringSimilarity(
        invoiceData.concept.toLowerCase(),
        project.description.toLowerCase()
      );
      if (similarity > 0.5) {
        score += similarity * 20;
        matches++;
      }
    }

    const finalScore = total > 0 ? Math.min(100, score) : 0;

    return {
      project,
      matchScore: finalScore,
      matchReason: `String similarity match: ${matches}/${total} criteria matched`,
      matchDetails: {
        overallConfidence: finalScore
      }
    };
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    return maxLength === 0 ? 1 : 1 - distance / maxLength;
  }

  /**
   * Levenshtein distance calculation
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }
}

export const projectMatchingService = new ProjectMatchingService();