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
    const vendorMatch = calculateVendorMatch(metadata.vendorName, project);
    const amountMatch = calculateAmountMatch(metadata.totalAmount, project.budget);
    
    // Weighted final score
    const finalScore = Math.round(
      (aiScore * 0.4) +           // 40% AI analysis
      (nameMatch * 0.25) +        // 25% name similarity
      (addressMatch * 0.15) +     // 15% location match
      (vendorMatch * 0.10) +      // 10% vendor relationship
      (amountMatch * 0.10)        // 10% budget alignment
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
  
  // Calculate Levenshtein distance similarity
  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  const similarity = ((maxLength - distance) / maxLength) * 100;
  
  return Math.max(0, Math.round(similarity));
}

function calculateAddressMatch(metadata: MatchingMetadata, project: Project): number {
  let score = 0;
  let checks = 0;
  
  // City match
  if (metadata.city && project.city) {
    checks++;
    if (metadata.city.toLowerCase().includes(project.city.toLowerCase()) ||
        project.city.toLowerCase().includes(metadata.city.toLowerCase())) {
      score += 100;
    }
  }
  
  // Address match
  if (metadata.address && project.address) {
    checks++;
    const addressSimilarity = calculateStringMatch(metadata.address, project.address);
    score += addressSimilarity;
  }
  
  return checks > 0 ? score / checks : 0;
}

function calculateVendorMatch(vendorName?: string, project?: Project): number {
  if (!vendorName || !project.supervisor) return 0;
  
  // Simple check if vendor name appears in project supervisor or description
  const projectText = `${project.supervisor} ${project.description || ''}`.toLowerCase();
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