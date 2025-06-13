import OpenAI from "openai";
import { Invoice, Project, LineItem } from "../shared/schema.js";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ProjectMatch {
  project: Project;
  confidence: number;
  matchDetails: {
    nameMatch: number;
    addressMatch: number;
    vendorMatch: number;
    amountMatch: number;
    reasonings: string[];
  };
}

export interface MatchingMetadata {
  projectName?: string;
  address?: string;
  city?: string;
  buyerName?: string;
  vendorName?: string;
  taxId?: string;
  totalAmount?: string;
  currency?: string;
}

export async function matchProjectToInvoice(
  invoice: Invoice,
  lineItems: LineItem[],
  projects: Project[],
  threshold: number = 80
): Promise<{
  matches: ProjectMatch[];
  autoMatch: ProjectMatch | null;
  recommendation: string;
}> {
  // Extract metadata from invoice
  const metadata = extractInvoiceMetadata(invoice);
  
  // Get AI-powered matches
  const aiMatches = await getAIProjectMatches(metadata, projects);
  
  // Calculate final scores combining AI analysis with rule-based matching
  const scoredMatches = await calculateFinalScores(aiMatches, metadata, projects, lineItems);
  
  // Sort by confidence score (descending)
  const sortedMatches = scoredMatches.sort((a, b) => b.confidence - a.confidence);
  
  // Get top 3 matches
  const topMatches = sortedMatches.slice(0, 3);
  
  // Determine auto-match
  const autoMatch = topMatches.length > 0 && topMatches[0].confidence >= threshold 
    ? topMatches[0] 
    : null;
  
  // Generate recommendation
  const recommendation = generateMatchingRecommendation(topMatches, threshold, autoMatch);
  
  return {
    matches: topMatches,
    autoMatch,
    recommendation
  };
}

function extractInvoiceMetadata(invoice: Invoice): MatchingMetadata {
  const extractedData = invoice.extractedData as any;
  
  return {
    projectName: invoice.projectName || extractedData?.project_name || extractedData?.projectName,
    address: extractedData?.address || extractedData?.billing_address,
    city: extractedData?.city || extractedData?.billing_city,
    buyerName: extractedData?.buyer_name || extractedData?.buyerName || extractedData?.company_name,
    vendorName: invoice.vendorName || extractedData?.vendor_name || extractedData?.supplier_name,
    taxId: extractedData?.tax_id || extractedData?.vat_number || extractedData?.ruc,
    totalAmount: invoice.totalAmount || extractedData?.total_amount,
    currency: invoice.currency || extractedData?.currency || "COP"
  };
}

async function getAIProjectMatches(
  metadata: MatchingMetadata,
  projects: Project[]
): Promise<{ projectId: string; aiScore: number; reasoning: string }[]> {
  try {
    const prompt = `
You are an expert at matching invoices to construction projects in Latin America. 
Analyze the invoice metadata and rank how well it matches each project.

Invoice Metadata:
- Project Name: ${metadata.projectName || 'Not specified'}
- Address: ${metadata.address || 'Not specified'}
- City: ${metadata.city || 'Not specified'}
- Buyer: ${metadata.buyerName || 'Not specified'}
- Vendor: ${metadata.vendorName || 'Not specified'}
- Tax ID: ${metadata.taxId || 'Not specified'}
- Amount: ${metadata.totalAmount || 'Not specified'} ${metadata.currency}

Available Projects:
${projects.map(p => `
- ID: ${p.projectId}
- Name: ${p.name}
- Description: ${p.description || 'No description'}
- Address: ${p.address || 'No address'}
- City: ${p.city || 'No city'}
- VAT: ${p.vatNumber || 'No VAT'}
- Budget: ${p.budget || 'No budget'} ${p.currency}
- Supervisor: ${p.supervisor || 'No supervisor'}
`).join('')}

For each project, provide a confidence score (0-100) and brief reasoning. 
Focus on: project name similarity, address/location match, vendor relationships, budget alignment.

Respond in JSON format:
{
  "matches": [
    {
      "projectId": "project_id",
      "confidence": 85,
      "reasoning": "Strong name match and same city location"
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert at matching invoices to projects. Analyze carefully and provide accurate confidence scores based on the data provided. Respond only with valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 1500
    });

    const result = JSON.parse(response.choices[0].message.content || '{"matches": []}');
    return result.matches || [];
  } catch (error) {
    console.error('AI matching error:', error);
    return [];
  }
}

async function calculateFinalScores(
  aiMatches: { projectId: string; aiScore: number; reasoning: string }[],
  metadata: MatchingMetadata,
  projects: Project[],
  lineItems: LineItem[]
): Promise<ProjectMatch[]> {
  const matches: ProjectMatch[] = [];
  
  for (const project of projects) {
    const aiMatch = aiMatches.find(m => m.projectId === project.projectId);
    const aiScore = aiMatch?.aiScore || 0;
    
    // Calculate rule-based scores
    const nameMatch = calculateStringMatch(metadata.projectName, project.name);
    const addressMatch = calculateAddressMatch(metadata, project);
    const vendorMatch = calculateVendorMatch(metadata.vendorName || undefined, project);
    const amountMatch = calculateAmountMatch(metadata.totalAmount, project.budget || undefined);
    
    // Weighted final score - prioritizing address, city, and project name
    const finalScore = Math.round(
      (nameMatch * 0.40) +        // 40% project name similarity
      (addressMatch * 0.30) +     // 30% address/city match
      (aiScore * 0.20) +          // 20% AI analysis
      (vendorMatch * 0.05) +      // 5% vendor relationship
      (amountMatch * 0.05)        // 5% budget alignment
    );
    
    const reasonings = [
      aiMatch?.reasoning || 'No AI analysis available',
      nameMatch > 70 ? 'Strong project name similarity' : nameMatch > 40 ? 'Moderate name similarity' : 'Low name similarity',
      addressMatch > 70 ? 'Location matches well' : addressMatch > 40 ? 'Partial location match' : 'Different location',
    ].filter(Boolean);
    
    matches.push({
      project,
      confidence: finalScore,
      matchDetails: {
        nameMatch,
        addressMatch,
        vendorMatch,
        amountMatch,
        reasonings
      }
    });
  }
  
  return matches;
}

function calculateStringMatch(str1?: string, str2?: string): number {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 100;
  
  // Check for substring matches
  if (s1.includes(s2) || s2.includes(s1)) return 85;
  
  // Enhanced project name matching - check for word-level matches
  const words1 = s1.split(/[\s\-_.,;:]+/).filter(w => w.length > 2);
  const words2 = s2.split(/[\s\-_.,;:]+/).filter(w => w.length > 2);
  
  let wordMatches = 0;
  const totalWords = Math.max(words1.length, words2.length);
  
  for (const word1 of words1) {
    for (const word2 of words2) {
      if (word1 === word2) {
        wordMatches += 2; // Exact word match
      } else if (word1.includes(word2) || word2.includes(word1)) {
        wordMatches += 1; // Partial word match
      }
    }
  }
  
  const wordScore = totalWords > 0 ? Math.min((wordMatches / totalWords) * 100, 90) : 0;
  
  // Calculate Levenshtein distance similarity
  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  const levenshteinScore = ((maxLength - distance) / maxLength) * 100;
  
  // Return the higher of word-based or character-based matching
  return Math.max(0, Math.round(Math.max(wordScore, levenshteinScore)));
}

function calculateAddressMatch(metadata: MatchingMetadata, project: Project): number {
  let score = 0;
  let checks = 0;
  
  // City match - exact and partial matching
  if (metadata.city && project.city) {
    checks++;
    const cityInvoice = metadata.city.toLowerCase().trim();
    const cityProject = project.city.toLowerCase().trim();
    
    if (cityInvoice === cityProject) {
      score += 100; // Perfect city match
    } else if (cityInvoice.includes(cityProject) || cityProject.includes(cityInvoice)) {
      score += 80; // Partial city match
    } else {
      // Check for common city abbreviations or variations
      const cityWords = cityInvoice.split(/[\s,.-]+/);
      const projectWords = cityProject.split(/[\s,.-]+/);
      
      for (const invoiceWord of cityWords) {
        for (const projectWord of projectWords) {
          if (invoiceWord.length > 2 && projectWord.length > 2 && 
              (invoiceWord.includes(projectWord) || projectWord.includes(invoiceWord))) {
            score += 60;
            break;
          }
        }
      }
    }
  }
  
  // Address match - enhanced string matching
  if (metadata.address && project.address) {
    checks++;
    const addressSimilarity = calculateStringMatch(metadata.address, project.address);
    score += addressSimilarity;
    
    // Bonus for exact street number or street name matches
    const invoiceAddress = metadata.address.toLowerCase();
    const projectAddress = project.address.toLowerCase();
    
    // Extract potential street numbers and names
    const invoiceNumbers = invoiceAddress.match(/\b\d+\b/g) || [];
    const projectNumbers = projectAddress.match(/\b\d+\b/g) || [];
    
    // Bonus for matching street numbers
    for (const num of invoiceNumbers) {
      if (projectNumbers.includes(num)) {
        score += 20;
        break;
      }
    }
  }
  
  return checks > 0 ? Math.min(score / checks, 100) : 0;
}

function calculateVendorMatch(vendorName?: string, project?: Project): number {
  if (!vendorName || !project?.supervisor) return 0;
  
  // Simple check if vendor name appears in project supervisor or description
  const projectText = `${project?.supervisor} ${project?.description || ''}`.toLowerCase();
  const vendor = vendorName.toLowerCase();
  
  if (projectText.includes(vendor)) return 80;
  return 20; // Base score for having vendor info
}

function calculateAmountMatch(invoiceAmount?: string, projectBudget?: string): number {
  if (!invoiceAmount || !projectBudget) return 0;
  
  const invoice = parseFloat(invoiceAmount);
  const budget = parseFloat(projectBudget);
  
  if (isNaN(invoice) || isNaN(budget)) return 0;
  
  // Calculate percentage of budget
  const percentage = (invoice / budget) * 100;
  
  if (percentage <= 10) return 90;      // Small expense, good match
  if (percentage <= 25) return 80;      // Reasonable expense
  if (percentage <= 50) return 60;      // Significant expense
  if (percentage <= 100) return 40;     // Large expense, still possible
  return 20;                            // Over budget, less likely
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
  
  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + indicator  // substitution
      );
    }
  }
  
  return matrix[str2.length][str1.length];
}

function generateMatchingRecommendation(
  matches: ProjectMatch[],
  threshold: number,
  autoMatch: ProjectMatch | null
): string {
  if (matches.length === 0) {
    return "No suitable project matches found. Consider creating a new project or reviewing the invoice data.";
  }
  
  const topMatch = matches[0];
  
  if (autoMatch) {
    return `Automatically matched to "${autoMatch.project.name}" with ${autoMatch.confidence}% confidence (above ${threshold}% threshold).`;
  }
  
  if (topMatch.confidence >= 60) {
    return `Top candidate is "${topMatch.project.name}" with ${topMatch.confidence}% confidence. Review and confirm manually.`;
  }
  
  return `Low confidence matches found (highest: ${topMatch.confidence}%). Manual review recommended or consider creating a new project.`;
}

export async function updateInvoiceProjectMatch(
  invoiceId: number,
  projectId: string,
  confidence: number,
  matchedBy: 'AI' | 'user',
  matchStatus: 'auto' | 'manual' | 'no_match'
): Promise<void> {
  // This will be implemented in the storage layer
  console.log(`Updating invoice ${invoiceId} with project ${projectId}, confidence: ${confidence}, matched by: ${matchedBy}`);
}