
import { storage } from "../storage";

export interface LearningMetrics {
  extractionAccuracy: number;
  commonErrors: Array<{
    field: string;
    errorType: string;
    frequency: number;
    trend: 'improving' | 'stable' | 'declining';
  }>;
  improvementRate: number;
  recentPerformance: Array<{
    date: string;
    accuracy: number;
    totalExtractions: number;
    errorCount: number;
  }>;
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

  // Identify common extraction errors and their trends
  static async analyzeCommonErrors(): Promise<Array<{
    field: string;
    errorType: string;
    frequency: number;
    trend: 'improving' | 'stable' | 'declining';
  }>> {
    const recentErrors = await storage.getRecentFeedbackLogs(90); // Last 90 days
    const olderErrors = await storage.getFeedbackLogsInRange(180, 90); // 90-180 days ago

    // Group errors by field and type
    const errorGroups = new Map<string, { recent: number; older: number }>();

    // Count recent errors
    recentErrors.forEach(log => {
      if (log.reason) {
        const key = this.categorizeError(log.reason);
        const current = errorGroups.get(key) || { recent: 0, older: 0 };
        current.recent++;
        errorGroups.set(key, current);
      }
    });

    // Count older errors
    olderErrors.forEach(log => {
      if (log.reason) {
        const key = this.categorizeError(log.reason);
        const current = errorGroups.get(key) || { recent: 0, older: 0 };
        current.older++;
        errorGroups.set(key, current);
      }
    });

    // Calculate trends
    const commonErrors = Array.from(errorGroups.entries()).map(([key, counts]) => {
      const [field, errorType] = key.split('::');
      let trend: 'improving' | 'stable' | 'declining' = 'stable';

      if (counts.older > 0) {
        const changeRate = (counts.recent - counts.older) / counts.older;
        if (changeRate < -0.2) trend = 'improving'; // 20% fewer errors
        else if (changeRate > 0.2) trend = 'declining'; // 20% more errors
      }

      return {
        field,
        errorType,
        frequency: counts.recent,
        trend
      };
    });

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

  // Record project assignment feedback for learning
  static async recordProjectAssignmentFeedback(
    invoiceId: number, 
    assignedProjectId: string, 
    extractedData: any, 
    correctProject: any, 
    userId: string
  ): Promise<void> {
    try {
      console.log(`Recording project assignment feedback for invoice ${invoiceId}:`, {
        assignedProjectId,
        extractedProjectName: extractedData?.projectName,
        correctProjectName: correctProject?.name,
        userId,
        timestamp: new Date().toISOString(),
      });

      // This data can be used to improve the project matching algorithm
      // by learning from user corrections and manual assignments
    } catch (error) {
      console.error('Error recording project assignment feedback:', error);
    }
  }

  private static categorizeError(reason: string): string {
    const lowerReason = reason.toLowerCase();
    
    if (lowerReason.includes('total') || lowerReason.includes('amount')) {
      return 'totalAmount::extraction_error';
    } else if (lowerReason.includes('vendor') || lowerReason.includes('company')) {
      return 'vendorName::extraction_error';
    } else if (lowerReason.includes('date')) {
      return 'invoiceDate::extraction_error';
    } else if (lowerReason.includes('tax') || lowerReason.includes('nit')) {
      return 'taxId::extraction_error';
    } else if (lowerReason.includes('number') || lowerReason.includes('invoice')) {
      return 'invoiceNumber::extraction_error';
    } else if (lowerReason.includes('project') || lowerReason.includes('manual_project_assignment')) {
      return 'projectAssignment::learning_feedback';
    } else {
      return 'general::extraction_error';
    }
  }
}
