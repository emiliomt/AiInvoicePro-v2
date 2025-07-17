
import { storage } from "../storage";
import OpenAI from "openai";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || ""
});

export interface LearningMetrics {
  extractionAccuracy: number;
  commonErrors: Array<{
    field: string;
    errorType: string;
    frequency: number;
    trend: 'improving' | 'stable' | 'declining';
    examples: string[];
    suggestedFix: string;
  }>;
  improvementRate: number;
  recentPerformance: Array<{
    date: string;
    accuracy: number;
    totalExtractions: number;
    errorCount: number;
  }>;
  learningInsights: {
    totalFeedbackProcessed: number;
    activelyLearning: boolean;
    lastUpdate: Date;
    confidenceImprovement: number;
  };
}

export class LearningTracker {
  // Track extraction accuracy over time
  static async calculateExtractionAccuracy(timeframe: number = 30): Promise<number> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeframe);

    // Get all feedback logs in timeframe
    const feedbackLogs = await storage.getFeedbackLogsInTimeframe(startDate);
    const totalExtractions = await storage.getExtractionsInTimeframe(startDate);

    if (totalExtractions === 0) return 100;

    const errorCount = feedbackLogs.length;
    const accuracy = ((totalExtractions - errorCount) / totalExtractions) * 100;
    
    return Math.max(0, Math.min(100, accuracy));
  }

  // Identify common extraction errors and their trends with AI-powered analysis
  static async analyzeCommonErrors(): Promise<Array<{
    field: string;
    errorType: string;
    frequency: number;
    trend: 'improving' | 'stable' | 'declining';
    examples: string[];
    suggestedFix: string;
  }>> {
    const recentErrors = await storage.getRecentFeedbackLogs(90); // Last 90 days
    const olderErrors = await storage.getFeedbackLogsInRange(180, 90); // 90-180 days ago

    // Group errors by field and type with detailed analysis
    const errorGroups = new Map<string, { 
      recent: number; 
      older: number; 
      examples: Array<{reason: string, corrected: any, original: any}>;
      recentExamples: Array<{reason: string, corrected: any, original: any}>;
    }>();

    // Process recent errors with more detail
    recentErrors.forEach(log => {
      if (log.reason) {
        const key = this.categorizeError(log.reason);
        const current = errorGroups.get(key) || { recent: 0, older: 0, examples: [], recentExamples: [] };
        current.recent++;
        current.recentExamples.push({
          reason: log.reason,
          corrected: log.correctedData,
          original: log.extractedData
        });
        if (current.examples.length < 5) {
          current.examples.push({
            reason: log.reason,
            corrected: log.correctedData,
            original: log.extractedData
          });
        }
        errorGroups.set(key, current);
      }
    });

    // Count older errors
    olderErrors.forEach(log => {
      if (log.reason) {
        const key = this.categorizeError(log.reason);
        const current = errorGroups.get(key) || { recent: 0, older: 0, examples: [], recentExamples: [] };
        current.older++;
        errorGroups.set(key, current);
      }
    });

    // Calculate trends and generate AI-powered suggestions
    const commonErrors = [];
    for (const [key, counts] of errorGroups.entries()) {
      const [field, errorType] = key.split('::');
      let trend: 'improving' | 'stable' | 'declining' = 'stable';

      if (counts.older > 0) {
        const changeRate = (counts.recent - counts.older) / counts.older;
        if (changeRate < -0.2) trend = 'improving';
        else if (changeRate > 0.2) trend = 'declining';
      }

      // Generate AI-powered suggestions for fixes
      const suggestedFix = await this.generateErrorFix(field, errorType, counts.examples);
      const exampleReasons = counts.examples.map(e => e.reason).slice(0, 3);

      commonErrors.push({
        field,
        errorType,
        frequency: counts.recent,
        trend,
        examples: exampleReasons,
        suggestedFix
      });
    }

    return commonErrors.sort((a, b) => b.frequency - a.frequency);
  }

  // Get performance metrics over time
  static async getPerformanceHistory(days: number = 30): Promise<Array<{
    date: string;
    accuracy: number;
    totalExtractions: number;
    errorCount: number;
  }>> {
    const history = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const totalExtractions = await storage.getExtractionsForDate(date);
      const errorCount = await storage.getFeedbackLogsForDate(date);
      const accuracy = totalExtractions > 0 ? 
        ((totalExtractions - errorCount.length) / totalExtractions) * 100 : 100;

      history.push({
        date: dateStr,
        accuracy: Math.round(accuracy * 100) / 100,
        totalExtractions,
        errorCount: errorCount.length
      });
    }

    return history;
  }

  // Calculate improvement rate
  static async calculateImprovementRate(): Promise<number> {
    const recentAccuracy = await this.calculateExtractionAccuracy(30);
    const previousAccuracy = await this.calculateExtractionAccuracy(60);

    if (previousAccuracy === 0) return 0;
    
    return ((recentAccuracy - previousAccuracy) / previousAccuracy) * 100;
  }

  // Generate learning insights
  static async generateLearningInsights(): Promise<{
    summary: string;
    recommendations: string[];
    keyMetrics: {
      accuracy: number;
      improvementRate: number;
      totalFeedback: number;
    };
  }> {
    const accuracy = await this.calculateExtractionAccuracy();
    const improvementRate = await this.calculateImprovementRate();
    const commonErrors = await this.analyzeCommonErrors();
    const totalFeedback = await storage.getTotalFeedbackCount();

    let summary = `AI extraction accuracy is currently ${accuracy.toFixed(1)}%`;
    
    if (improvementRate > 5) {
      summary += ` and improving rapidly (+${improvementRate.toFixed(1)}%)`;
    } else if (improvementRate > 0) {
      summary += ` and showing steady improvement (+${improvementRate.toFixed(1)}%)`;
    } else if (improvementRate < -5) {
      summary += ` but declining (-${Math.abs(improvementRate).toFixed(1)}%)`;
    } else {
      summary += ` and remaining stable`;
    }

    const recommendations = [];
    
    // Generate recommendations based on common errors
    const topErrors = commonErrors.slice(0, 3);
    topErrors.forEach(error => {
      if (error.trend === 'declining') {
        recommendations.push(`Focus on improving ${error.field} extraction - errors increasing`);
      } else if (error.frequency > 5) {
        recommendations.push(`Consider training data for ${error.field} - high error frequency`);
      }
    });

    if (totalFeedback < 10) {
      recommendations.push("Encourage more user feedback to improve learning insights");
    }

    if (accuracy < 80) {
      recommendations.push("Consider reviewing AI extraction prompts for better accuracy");
    }

    return {
      summary,
      recommendations,
      keyMetrics: {
        accuracy,
        improvementRate,
        totalFeedback
      }
    };
  }

  // Record feedback for learning improvements
  static async recordFeedback(
    invoiceId: number,
    userId: string,
    originalData: any,
    correctedData: any,
    reason: string,
    fileName?: string
  ): Promise<void> {
    try {
      console.log(`Recording feedback for invoice ${invoiceId} from user ${userId}: ${reason}`);
      
      // Apply learning from the feedback immediately
      await this.applyLearningFromFeedback();
      
      // Store specific learning insights based on the corrections
      if (correctedData) {
        for (const [field, correctedValue] of Object.entries(correctedData)) {
          if (correctedValue && correctedValue !== originalData?.[field]) {
            await storage.storeLearningInsight({
              field: field,
              errorType: 'user_correction',
              suggestedFix: `Correct value: ${correctedValue}`,
              frequency: 1,
              lastSeen: new Date()
            });
          }
        }
      }
      
      console.log(`Feedback processing completed for invoice ${invoiceId}`);
    } catch (error) {
      console.error('Error recording feedback:', error);
    }
  }

  // Record positive feedback for successful extractions
  static async recordPositiveFeedback(invoiceId: number, userId: string): Promise<void> {
    try {
      // This helps balance the learning data with positive examples
      console.log(`Recording positive feedback for invoice ${invoiceId} from user ${userId}`);
      
      // Could be used to update confidence scores or model training data
      // For now, we log it for future ML pipeline improvements
    } catch (error) {
      console.error('Error recording positive feedback:', error);
    }
  }

  // Generate AI-powered suggestions for fixing common errors
  private static async generateErrorFix(field: string, errorType: string, examples: Array<{reason: string, corrected: any, original: any}>): Promise<string> {
    if (examples.length === 0) return "No specific fix available";

    try {
      const prompt = `Analyze these extraction errors for the field "${field}" and suggest a specific improvement:

Error Examples:
${examples.map(e => `
- Issue: ${e.reason}
- Original: ${JSON.stringify(e.original?.[field] || 'null')}
- Corrected: ${JSON.stringify(e.corrected?.[field] || 'null')}
`).join('\n')}

Provide a concise, actionable suggestion to improve extraction accuracy for this field.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an AI extraction expert. Provide specific, actionable suggestions to improve data extraction accuracy." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 150
      });

      return response.choices[0].message.content || "Review extraction patterns for this field";
    } catch (error) {
      console.error('Error generating fix suggestion:', error);
      return "Review extraction patterns for this field";
    }
  }

  // Create improved extraction prompts based on feedback
  static async generateImprovedExtractionPrompt(field: string, commonErrors: any[]): Promise<string> {
    const relevantErrors = commonErrors.filter(e => e.field === field);
    if (relevantErrors.length === 0) return "";

    try {
      const prompt = `Based on these common extraction errors for the "${field}" field, generate an improved extraction instruction:

Common Issues:
${relevantErrors.map(e => `- ${e.errorType}: ${e.suggestedFix} (${e.frequency} occurrences)`).join('\n')}

Generate a specific instruction that could be added to the extraction prompt to improve accuracy for this field.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an AI prompt engineer. Create specific extraction instructions that prevent common errors." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 200
      });

      return response.choices[0].message.content || "";
    } catch (error) {
      console.error('Error generating improved prompt:', error);
      return "";
    }
  }

  // Apply learning from feedback to improve future extractions
  static async applyLearningFromFeedback(): Promise<void> {
    const commonErrors = await this.analyzeCommonErrors();
    
    // Store learned patterns for future use with lower threshold
    for (const error of commonErrors.slice(0, 10)) { // Top 10 most common
      if (error.frequency >= 2) { // Lower threshold for faster learning
        try {
          console.log(`Learning applied for ${error.field}: ${error.suggestedFix}`);
          
          // Store in learning cache or database
          await storage.storeLearningInsight({
            field: error.field,
            errorType: error.errorType,
            suggestedFix: error.suggestedFix,
            frequency: error.frequency,
            lastSeen: new Date()
          });
          
          // Also create specific improvement rules
          if (error.field === 'totalAmount' && error.frequency >= 3) {
            await this.createAmountExtractionRule(error);
          } else if (error.field === 'vendorName' && error.frequency >= 3) {
            await this.createVendorNameRule(error);
          } else if (error.field === 'invoiceDate' && error.frequency >= 3) {
            await this.createDateExtractionRule(error);
          }
        } catch (error) {
          console.error('Error applying learning:', error);
        }
      }
    }
  }

  // Create specific rules for amount extraction
  private static async createAmountExtractionRule(error: any): Promise<void> {
    const rule = `For totalAmount extraction: ${error.suggestedFix}. Look for patterns like 'Total:', 'Total a Pagar:', 'Valor Total:' followed by numbers.`;
    await storage.storeLearningInsight({
      field: 'totalAmount',
      errorType: 'extraction_rule',
      suggestedFix: rule,
      frequency: error.frequency,
      lastSeen: new Date()
    });
  }

  // Create specific rules for vendor name extraction
  private static async createVendorNameRule(error: any): Promise<void> {
    const rule = `For vendorName extraction: ${error.suggestedFix}. Look after 'Emisor:', 'Proveedor:', 'Razón Social:' labels.`;
    await storage.storeLearningInsight({
      field: 'vendorName',
      errorType: 'extraction_rule',
      suggestedFix: rule,
      frequency: error.frequency,
      lastSeen: new Date()
    });
  }

  // Create specific rules for date extraction
  private static async createDateExtractionRule(error: any): Promise<void> {
    const rule = `For invoiceDate extraction: ${error.suggestedFix}. Look for 'Fecha:', 'Fecha de Emisión:', 'Date:' followed by date patterns.`;
    await storage.storeLearningInsight({
      field: 'invoiceDate',
      errorType: 'extraction_rule',
      suggestedFix: rule,
      frequency: error.frequency,
      lastSeen: new Date()
    });
  }

  private static categorizeError(reason: string): string {
    const lowerReason = reason.toLowerCase();
    
    if (lowerReason.includes('total') || lowerReason.includes('amount') || lowerReason.includes('precio')) {
      return 'totalAmount::extraction_error';
    } else if (lowerReason.includes('vendor') || lowerReason.includes('company') || lowerReason.includes('proveedor')) {
      return 'vendorName::extraction_error';
    } else if (lowerReason.includes('date') || lowerReason.includes('fecha')) {
      return 'invoiceDate::extraction_error';
    } else if (lowerReason.includes('tax') || lowerReason.includes('nit') || lowerReason.includes('iva')) {
      return 'taxId::extraction_error';
    } else if (lowerReason.includes('number') || lowerReason.includes('invoice') || lowerReason.includes('factura')) {
      return 'invoiceNumber::extraction_error';
    } else if (lowerReason.includes('project') || lowerReason.includes('proyecto')) {
      return 'projectName::extraction_error';
    } else if (lowerReason.includes('address') || lowerReason.includes('direccion')) {
      return 'address::extraction_error';
    } else {
      return 'general::extraction_error';
    }
  }
}
