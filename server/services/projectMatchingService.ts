import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface InvoiceData {
  vendor_name: string;
  project_name?: string;
  description?: string;
  address?: string;
  city?: string;
}

interface Project {
  project_id: string;
  project_name: string;
  address?: string;
  city?: string;
  supervisor?: string;
}

interface ProjectMatchResult {
  project_name: string | null;
  project_id: string | null;
  match_reason: string;
  confidence_score: number;
  flagged: boolean;
}

export async function matchInvoiceToProject(
  invoiceData: InvoiceData,
  projects: Project[]
): Promise<ProjectMatchResult> {
  try {
    const systemPrompt = `You are an AI agent responsible for matching invoices to construction or infrastructure projects.

Your job is to take structured invoice data and compare it to a list of validated projects, returning the best matching project and a confidence score.

Use the following matching criteria as selected by the user:
- Project Name (exact or partial match)
- Address similarity (street, neighborhood, postal code)
- City match
- Supervisor (optional)
- Keywords in the invoice description that relate to project name or known scope

Do not guess. If a match is weak, assign a low confidence score and flag it.

Return the top match with the following structure:
{
  "project_name": "...",
  "project_id": "...",
  "match_reason": "...",
  "confidence_score": 0.00,
  "flagged": true/false
}

If no project meets a reasonable confidence threshold (>0.65), return:
{
  "project_name": null,
  "project_id": null,
  "match_reason": "No project met the threshold",
  "confidence_score": 0.00,
  "flagged": true
}`;

    const userPrompt = JSON.stringify({
      invoice: invoiceData,
      projects: projects
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 500
    });

    const result = response.choices[0]?.message?.content;
    if (!result) {
      throw new Error('No response from OpenAI');
    }

    // Parse the JSON response
    const matchResult: ProjectMatchResult = JSON.parse(result);
    
    // Validate the response structure
    if (typeof matchResult.confidence_score !== 'number' || 
        typeof matchResult.flagged !== 'boolean') {
      throw new Error('Invalid response format from OpenAI');
    }

    return matchResult;

  } catch (error: any) {
    console.error('Error in project matching:', error);
    
    // Return a safe fallback result
    return {
      project_name: null,
      project_id: null,
      match_reason: `Error during matching: ${error.message}`,
      confidence_score: 0.0,
      flagged: true
    };
  }
}

export function extractInvoiceDataForMatching(invoice: any, extractedData: any): InvoiceData {
  return {
    vendor_name: invoice.vendorName || extractedData?.vendorName || '',
    project_name: extractedData?.projectName || '',
    description: extractedData?.concept || extractedData?.descriptionSummary || '',
    address: extractedData?.projectAddress || '',
    city: extractedData?.projectCity || ''
  };
}

export function formatProjectsForMatching(projects: any[]): Project[] {
  return projects.map(project => ({
    project_id: project.projectId || project.id,
    project_name: project.name,
    address: project.address,
    city: project.city,
    supervisor: project.supervisor
  }));
}