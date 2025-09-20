import { OrchestratorConfig } from './config';

export enum PipelineState {
  IMPORTED = 'import_invoices',
  OCR_PROCESSED = 'ocr_process', 
  AI_EXTRACTED = 'ai_extract',
  XML_PARSED = 'xml_parse',
  VALIDATED = 'validate',
  ERP_POSTED = 'erp_post',
  RECONCILED = 'reconcile',
  NOTIFIED = 'notify',
  DONE = 'done'
}

export interface StateTransition {
  from: PipelineState;
  to: PipelineState;
  condition?: (data: any) => boolean;
}

export interface StateDefinition {
  name: PipelineState;
  description: string;
  timeout: number;
  retryable: boolean;
  canSkip: boolean;
  prerequisites: PipelineState[];
}

export class StateMachine {
  private transitions: Map<PipelineState, PipelineState> = new Map();
  private states: Map<PipelineState, StateDefinition> = new Map();

  constructor(private config: OrchestratorConfig) {
    this.initializeStates();
    this.initializeTransitions();
  }

  private initializeStates(): void {
    const stateDefinitions: StateDefinition[] = [
      {
        name: PipelineState.IMPORTED,
        description: 'Import invoices from ERP or external sources',
        timeout: this.config.timeouts.import_invoices,
        retryable: true,
        canSkip: false,
        prerequisites: []
      },
      {
        name: PipelineState.OCR_PROCESSED,
        description: 'Extract text content using OCR processing',
        timeout: this.config.timeouts.ocr_process,
        retryable: true,
        canSkip: true, // Can skip if content is already structured (e.g., XML)
        prerequisites: [PipelineState.IMPORTED]
      },
      {
        name: PipelineState.AI_EXTRACTED,
        description: 'Extract structured data using AI/LLM processing',
        timeout: this.config.timeouts.ai_extract,
        retryable: true,
        canSkip: false,
        prerequisites: [PipelineState.OCR_PROCESSED]
      },
      {
        name: PipelineState.XML_PARSED,
        description: 'Parse XML invoice data for structured content',
        timeout: this.config.timeouts.xml_parse,
        retryable: true,
        canSkip: true, // Can skip if not XML format
        prerequisites: [PipelineState.IMPORTED]
      },
      {
        name: PipelineState.VALIDATED,
        description: 'Validate extracted data against business rules',
        timeout: this.config.timeouts.validate,
        retryable: true,
        canSkip: false,
        prerequisites: [] // Will be validated dynamically - needs either AI_EXTRACTED OR XML_PARSED
      },
      {
        name: PipelineState.ERP_POSTED,
        description: 'Post validated invoice data to ERP system',
        timeout: this.config.timeouts.erp_post,
        retryable: true,
        canSkip: true, // Can skip in sandbox mode
        prerequisites: [PipelineState.VALIDATED]
      },
      {
        name: PipelineState.RECONCILED,
        description: 'Reconcile posted data with ERP records',
        timeout: this.config.timeouts.reconcile,
        retryable: true,
        canSkip: false,
        prerequisites: [PipelineState.ERP_POSTED]
      },
      {
        name: PipelineState.NOTIFIED,
        description: 'Send completion notifications to stakeholders',
        timeout: this.config.timeouts.notify,
        retryable: true,
        canSkip: true, // Notifications are optional
        prerequisites: [PipelineState.RECONCILED]
      }
    ];

    stateDefinitions.forEach(state => {
      this.states.set(state.name, state);
    });
  }

  private initializeTransitions(): void {
    // Flexible pipeline transitions - XML and AI extraction are alternative paths
    this.transitions.set(PipelineState.IMPORTED, PipelineState.OCR_PROCESSED);
    this.transitions.set(PipelineState.OCR_PROCESSED, PipelineState.AI_EXTRACTED);
    
    // Alternative paths: either AI extraction OR XML parsing can lead to validation
    this.transitions.set(PipelineState.AI_EXTRACTED, PipelineState.VALIDATED);
    this.transitions.set(PipelineState.XML_PARSED, PipelineState.VALIDATED);
    
    // Continue linear flow after validation
    this.transitions.set(PipelineState.VALIDATED, PipelineState.ERP_POSTED);
    this.transitions.set(PipelineState.ERP_POSTED, PipelineState.RECONCILED);
    this.transitions.set(PipelineState.RECONCILED, PipelineState.NOTIFIED);
    this.transitions.set(PipelineState.NOTIFIED, PipelineState.DONE);
    
    // XML parsing can happen directly from IMPORTED for XML files
    this.transitions.set(PipelineState.IMPORTED, PipelineState.XML_PARSED);
  }

  /**
   * Get the next state in the pipeline
   */
  getNextState(currentState: PipelineState): PipelineState {
    const nextState = this.transitions.get(currentState);
    if (!nextState) {
      throw new Error(`No transition defined for state: ${currentState}`);
    }
    return nextState;
  }

  /**
   * Get the previous state in the pipeline
   */
  getPreviousState(currentState: PipelineState): PipelineState | null {
    for (const [from, to] of Array.from(this.transitions.entries())) {
      if (to === currentState) {
        return from;
      }
    }
    return null;
  }

  /**
   * Check if a state can be skipped based on configuration and conditions
   */
  canSkipState(state: PipelineState, data?: any): boolean {
    const stateDefinition = this.states.get(state);
    if (!stateDefinition) {
      return false;
    }

    // Check if state is disabled in config
    if (!this.config.isStageEnabled(state)) {
      return true;
    }

    // Check if state can be skipped based on its definition
    if (!stateDefinition.canSkip) {
      return false;
    }

    // Apply state-specific skip logic
    switch (state) {
      case PipelineState.OCR_PROCESSED:
        // Skip OCR if we already have structured data (XML)
        return data?.isStructured || data?.format === 'xml';
      
      case PipelineState.XML_PARSED:
        // Skip XML parsing if not XML format
        return data?.format !== 'xml';
      
      case PipelineState.ERP_POSTED:
        // Skip ERP posting in sandbox mode or if disabled
        return this.config.tenants.default?.use_sandbox || !this.config.featureFlags.enable_erp_post;
      
      case PipelineState.NOTIFIED:
        // Skip notifications if disabled
        return !this.config.featureFlags.enable_notify;
      
      default:
        return false;
    }
  }

  /**
   * Validate that all prerequisites for a state are met
   */
  validatePrerequisites(state: PipelineState, completedStates: Set<PipelineState>): boolean {
    const stateDefinition = this.states.get(state);
    if (!stateDefinition) {
      return false;
    }

    // Special handling for VALIDATED state - needs either AI_EXTRACTED OR XML_PARSED
    if (state === PipelineState.VALIDATED) {
      return completedStates.has(PipelineState.AI_EXTRACTED) || completedStates.has(PipelineState.XML_PARSED);
    }

    return stateDefinition.prerequisites.every(prerequisite => 
      completedStates.has(prerequisite) || this.canSkipState(prerequisite)
    );
  }

  /**
   * Get state definition
   */
  getStateDefinition(state: PipelineState): StateDefinition | undefined {
    return this.states.get(state);
  }

  /**
   * Get all states in order
   */
  getAllStates(): PipelineState[] {
    return [
      PipelineState.IMPORTED,
      PipelineState.OCR_PROCESSED,
      PipelineState.AI_EXTRACTED,
      PipelineState.XML_PARSED,
      PipelineState.VALIDATED,
      PipelineState.ERP_POSTED,
      PipelineState.RECONCILED,
      PipelineState.NOTIFIED
    ];
  }

  /**
   * Check if state is terminal (end state)
   */
  isTerminalState(state: PipelineState): boolean {
    return state === PipelineState.DONE;
  }

  /**
   * Check if state is retryable
   */
  isStateRetryable(state: PipelineState): boolean {
    const stateDefinition = this.states.get(state);
    return stateDefinition?.retryable ?? true;
  }

  /**
   * Get the pipeline path from start to end state
   */
  getPipelinePath(startState?: PipelineState, endState?: PipelineState): PipelineState[] {
    const start = startState || PipelineState.IMPORTED;
    const end = endState || PipelineState.DONE;
    
    const path: PipelineState[] = [];
    let current = start;
    
    while (current !== end && current !== PipelineState.DONE) {
      path.push(current);
      current = this.getNextState(current);
    }
    
    return path;
  }

  /**
   * Calculate estimated pipeline duration
   */
  estimatePipelineDuration(stages?: PipelineState[]): number {
    const stagesToProcess = stages || this.getAllStates();
    
    return stagesToProcess.reduce((total, stage) => {
      const stateDefinition = this.states.get(stage);
      return total + (stateDefinition?.timeout || 0);
    }, 0);
  }
}

/**
 * State machine error classes
 */
export class StateTransitionError extends Error {
  constructor(
    public fromState: PipelineState,
    public toState: PipelineState,
    message: string
  ) {
    super(`State transition error from ${fromState} to ${toState}: ${message}`);
    this.name = 'StateTransitionError';
  }
}

export class PrerequisiteError extends Error {
  constructor(
    public state: PipelineState,
    public missingPrerequisites: PipelineState[]
  ) {
    super(`Prerequisites not met for state ${state}: missing ${missingPrerequisites.join(', ')}`);
    this.name = 'PrerequisiteError';
  }
}

export class InvalidStateError extends Error {
  constructor(public state: string) {
    super(`Invalid pipeline state: ${state}`);
    this.name = 'InvalidStateError';
  }
}