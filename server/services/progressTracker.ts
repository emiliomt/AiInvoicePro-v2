import { WebSocket } from 'ws';

export interface ProgressStep {
  step: string;
  description: string;
  icon: string;
  estimatedTime: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  startTime?: Date;
  endTime?: Date;
  error?: string;
}

export interface ProgressSession {
  sessionId: string;
  userId: string;
  type: 'line-item-classification';
  status: 'initializing' | 'processing' | 'completed' | 'error';
  startTime: Date;
  endTime?: Date;
  currentStep: number;
  totalSteps: number;
  steps: ProgressStep[];
  metrics: {
    totalInvoices: number;
    processedInvoices: number;
    currentInvoice?: number;
    totalItems: number;
    processedItems: number;
    currentItem?: number;
    successRate: number;
    elapsedTime: number;
    estimatedRemaining: number;
  };
  results?: any[];
  error?: string;
}

export class ProgressTracker {
  private static sessions = new Map<string, ProgressSession>();
  private static websockets = new Map<string, Set<WebSocket>>();

  // Define the standard progress steps for line item classification
  private static readonly CLASSIFICATION_STEPS: Omit<ProgressStep, 'status' | 'startTime' | 'endTime'>[] = [
    {
      step: "Initializing Classification",
      description: "Setting up classification parameters and loading keywords",
      icon: "⚙️",
      estimatedTime: "2-3 seconds"
    },
    {
      step: "Extracting Line Items",
      description: "Parsing invoice data to extract individual line items",
      icon: "📋", 
      estimatedTime: "5-10 seconds per invoice"
    },
    {
      step: "Loading Classification Keywords",
      description: "Retrieving keyword categories and patterns for matching",
      icon: "🔑",
      estimatedTime: "1-2 seconds"
    },
    {
      step: "Classifying Line Items",
      description: "Applying AI and keyword matching to categorize items",
      icon: "🤖",
      estimatedTime: "3-5 seconds per item"
    },
    {
      step: "Saving Results",
      description: "Storing classification results in database",
      icon: "💾",
      estimatedTime: "2-3 seconds"
    },
    {
      step: "Processing Complete",
      description: "Classification completed successfully",
      icon: "✅",
      estimatedTime: "Complete"
    }
  ];

  static createSession(sessionId: string, userId: string, totalInvoices: number): ProgressSession {
    const session: ProgressSession = {
      sessionId,
      userId,
      type: 'line-item-classification',
      status: 'initializing',
      startTime: new Date(),
      currentStep: 0,
      totalSteps: this.CLASSIFICATION_STEPS.length,
      steps: this.CLASSIFICATION_STEPS.map(step => ({ ...step, status: 'pending' })),
      metrics: {
        totalInvoices,
        processedInvoices: 0,
        totalItems: 0,
        processedItems: 0,
        successRate: 0,
        elapsedTime: 0,
        estimatedRemaining: 0
      }
    };

    this.sessions.set(sessionId, session);
    this.broadcastUpdate(sessionId, 'classification_started');
    return session;
  }

  static getSession(sessionId: string): ProgressSession | undefined {
    return this.sessions.get(sessionId);
  }

  static updateStep(sessionId: string, stepIndex: number, status: 'active' | 'completed' | 'error', error?: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Mark previous steps as completed if we're progressing
    if (status === 'active' && stepIndex > session.currentStep) {
      for (let i = session.currentStep; i < stepIndex; i++) {
        if (session.steps[i].status === 'active') {
          session.steps[i].status = 'completed';
          session.steps[i].endTime = new Date();
        }
      }
    }

    // Update current step
    if (session.steps[stepIndex]) {
      session.steps[stepIndex].status = status;
      if (status === 'active' && !session.steps[stepIndex].startTime) {
        session.steps[stepIndex].startTime = new Date();
      }
      if ((status === 'completed' || status === 'error') && !session.steps[stepIndex].endTime) {
        session.steps[stepIndex].endTime = new Date();
      }
      if (error) {
        session.steps[stepIndex].error = error;
      }
    }

    session.currentStep = stepIndex;
    session.status = status === 'error' ? 'error' : 'processing';

    this.updateMetrics(sessionId);
    this.broadcastUpdate(sessionId, 'step_progress');
  }

  static updateMetrics(sessionId: string, metrics?: Partial<ProgressSession['metrics']>) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (metrics) {
      session.metrics = { ...session.metrics, ...metrics };
    }

    // Calculate elapsed time
    session.metrics.elapsedTime = Date.now() - session.startTime.getTime();

    // Calculate success rate
    if (session.metrics.processedItems > 0) {
      session.metrics.successRate = (session.metrics.processedItems / session.metrics.totalItems) * 100;
    }

    // Estimate remaining time based on current progress
    if (session.metrics.processedItems > 0 && session.metrics.totalItems > 0) {
      const avgTimePerItem = session.metrics.elapsedTime / session.metrics.processedItems;
      const remainingItems = session.metrics.totalItems - session.metrics.processedItems;
      session.metrics.estimatedRemaining = avgTimePerItem * remainingItems;
    }

    this.broadcastUpdate(sessionId, 'metrics_updated');
  }

  static completeSession(sessionId: string, results?: any[]) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Mark all steps as completed
    session.steps.forEach(step => {
      if (step.status === 'pending' || step.status === 'active') {
        step.status = 'completed';
        step.endTime = new Date();
      }
    });

    session.status = 'completed';
    session.endTime = new Date();
    session.currentStep = session.steps.length - 1;
    
    if (results) {
      session.results = results;
    }

    this.updateMetrics(sessionId);
    this.broadcastUpdate(sessionId, 'classification_finished');
  }

  static errorSession(sessionId: string, error: string, stepIndex?: number) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'error';
    session.error = error;
    session.endTime = new Date();

    if (stepIndex !== undefined && session.steps[stepIndex]) {
      session.steps[stepIndex].status = 'error';
      session.steps[stepIndex].error = error;
      session.steps[stepIndex].endTime = new Date();
    }

    this.broadcastUpdate(sessionId, 'classification_error');
  }

  static addWebSocket(sessionId: string, ws: WebSocket) {
    if (!this.websockets.has(sessionId)) {
      this.websockets.set(sessionId, new Set());
    }
    this.websockets.get(sessionId)!.add(ws);

    // Send current state to newly connected client
    const session = this.getSession(sessionId);
    if (session) {
      ws.send(JSON.stringify({
        type: 'progress_state',
        sessionId,
        data: session
      }));
    }
  }

  static removeWebSocket(sessionId: string, ws: WebSocket) {
    const sockets = this.websockets.get(sessionId);
    if (sockets) {
      sockets.delete(ws);
      if (sockets.size === 0) {
        this.websockets.delete(sessionId);
      }
    }
  }

  private static broadcastUpdate(sessionId: string, event: string) {
    const session = this.sessions.get(sessionId);
    const sockets = this.websockets.get(sessionId);
    
    if (session && sockets) {
      const message = JSON.stringify({
        type: event,
        sessionId,
        data: session
      });

      sockets.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });
    }
  }

  // Cleanup old sessions (call periodically)
  static cleanup() {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    
    for (const [sessionId, session] of Array.from(this.sessions.entries())) {
      if (session.startTime.getTime() < cutoff) {
        this.sessions.delete(sessionId);
        this.websockets.delete(sessionId);
      }
    }
  }

  // Get all active sessions for a user
  static getUserSessions(userId: string): ProgressSession[] {
    return Array.from(this.sessions.values())
      .filter(session => session.userId === userId);
  }
}

// Legacy compatibility layer for existing code
export const progressTracker = {
  sendProgress: (userId: string, data: any) => {
    // This is a legacy method - for new progress tracking use ProgressTracker directly
    console.log('Legacy progress tracker called:', { userId, data });
    // For now, just log - could be extended to create a compatible session if needed
  },
  initialize: (server: any) => {
    // Legacy initialization method - the new WebSocket setup is handled elsewhere
    console.log('Legacy progress tracker initialized');
  }
};