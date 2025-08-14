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
  title?: string;
  websockets?: Set<WebSocket>;
}

export class ProgressTracker {
  private static sessions = new Map<string, ProgressSession>();
  private static websockets = new Map<string, Set<WebSocket>>();
  private static completedSessions = new Map<string, ProgressSession>();

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

  static createSession(sessionId: string, userId: string, totalInvoices: number, title?: string): ProgressSession {
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
      },
      title: title || `Line Item Classification - ${totalInvoices} invoices`
    };

    this.sessions.set(sessionId, session);
    this.broadcastUpdate(sessionId, 'classification_started');

    console.log(`📊 Progress session created: ${sessionId} - ${session.title}`);
    return session;
  }

  static getSession(sessionId: string): ProgressSession | undefined {
    return this.sessions.get(sessionId) || this.completedSessions.get(sessionId);
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

  // Update progress with current count and optionally total count
  static updateProgress(sessionId: string, current: number, total?: number, message?: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Update metrics based on current progress
    if (total !== undefined) {
      session.metrics.totalItems = total; // Update total if provided
    }
    this.updateMetrics(sessionId, {
      processedItems: current
    });

    // Calculate percentage
    const percentage = session.metrics.totalItems > 0
      ? Math.round((current / session.metrics.totalItems) * 100)
      : 0;

    this.broadcastUpdate(sessionId, 'progress_update', {
      current,
      total: session.metrics.totalItems,
      percentage,
      message
    });

    console.log(`📈 Progress update: ${sessionId} - ${current}/${session.metrics.totalItems} (${percentage}%)`);
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
    this.broadcastUpdate(sessionId, 'classification_finished', {
      results,
      duration: session.endTime.getTime() - session.startTime.getTime()
    });

    // Move to completed sessions and keep for 30 minutes for review
    this.completedSessions.set(sessionId, session);
    this.sessions.delete(sessionId);

    // Keep completed sessions for 30 minutes
    setTimeout(() => {
      this.completedSessions.delete(sessionId);
      this.websockets.delete(sessionId);
      console.log(`🧹 Cleaned up completed session: ${sessionId}`);
    }, 30 * 60 * 1000); // 30 minutes

    console.log(`✅ Progress session completed: ${sessionId}`);
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

    this.broadcastUpdate(sessionId, 'classification_error', { error });

    // Move to completed sessions if it was active
    this.completedSessions.set(sessionId, session);
    this.sessions.delete(sessionId);

    console.log(`❌ Progress session error: ${sessionId} - ${error}`);
  }

  static addWebSocket(sessionId: string, ws: WebSocket) {
    if (!this.websockets.has(sessionId)) {
      this.websockets.set(sessionId, new Set());
    }
    this.websockets.get(sessionId)!.add(ws);

    // Send current state to newly connected client
    const session = this.getSession(sessionId);
    if (session) {
      this.sendToWebSocket(ws, {
        type: 'progress_state',
        sessionId,
        data: {
          ...session,
          percentage: session.metrics.totalItems > 0
            ? Math.round((session.metrics.processedItems / session.metrics.totalItems) * 100)
            : 0
        }
      });
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

  // Get recent completed sessions for a user
  static getRecentCompletedSessions(userId: string, includeCompleted: boolean = true): ProgressSession[] {
    const sessions: ProgressSession[] = [];

    // Add active sessions
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        sessions.push(session);
      }
    }

    // Add completed sessions if requested
    if (includeCompleted) {
      for (const session of this.completedSessions.values()) {
        if (session.userId === userId) {
          sessions.push(session);
        }
      }
    }

    return sessions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  private static broadcastUpdate(sessionId: string, event: string, data?: any) {
    const session = this.sessions.get(sessionId) || this.completedSessions.get(sessionId);
    const sockets = this.websockets.get(sessionId);

    if (session && sockets) {
      const message = {
        type: event,
        sessionId,
        data: {
          ...data,
          ...session,
          timestamp: new Date().toISOString()
        }
      };

      sockets.forEach(ws => {
        this.sendToWebSocket(ws, message);
      });
    }
  }

  private static sendToWebSocket(ws: WebSocket, message: any): void {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
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

    // Also cleanup old completed sessions
    for (const [sessionId, session] of Array.from(this.completedSessions.entries())) {
      if (session.startTime.getTime() < cutoff) {
        this.completedSessions.delete(sessionId);
        this.websockets.delete(sessionId);
      }
    }
  }

  // Cleanup disconnected websockets
  static cleanupWebSockets(): void {
    for (const [sessionId, sockets] of this.websockets.entries()) {
      const toRemove: WebSocket[] = [];
      sockets.forEach(ws => {
        if (ws.readyState !== WebSocket.OPEN) {
          toRemove.push(ws);
        }
      });
      toRemove.forEach(ws => sockets.delete(ws));

      if (sockets.size === 0) {
        this.websockets.delete(sessionId);
      }
    }
  }

  // Get all active sessions for a user
  static getUserSessions(userId: string): ProgressSession[] {
    return Array.from(this.sessions.values())
      .filter(session => session.userId === userId);
  }

  // Get recent sessions (including completed ones) for a user
  static getRecentUserSessions(userId: string, includeCompleted: boolean = true): ProgressSession[] {
    return this.getRecentCompletedSessions(userId, includeCompleted);
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

// Cleanup disconnected websockets every 5 minutes
setInterval(() => {
  ProgressTracker.cleanupWebSockets();
}, 5 * 60 * 1000);

// Cleanup old sessions every hour
setInterval(() => {
  ProgressTracker.cleanup();
}, 60 * 60 * 1000);