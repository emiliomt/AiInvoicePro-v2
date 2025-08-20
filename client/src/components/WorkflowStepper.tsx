import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Alert, AlertDescription } from './ui/alert';
import { Loader2, CheckCircle, XCircle, Play, RotateCcw, SkipForward } from 'lucide-react';

interface WorkflowStep {
  stepNumber: number;
  name: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result?: any;
  errorMessage?: string;
  executionTimeMs?: number;
  startedAt?: Date;
  completedAt?: Date;
}

interface WorkflowStatus {
  invoiceId: number;
  currentStep: number;
  mode: 'manual' | 'automatic';
  steps: WorkflowStep[];
  overallStatus: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt: Date;
  lastUpdatedAt: Date;
}

interface WorkflowStepperProps {
  invoiceId: number;
  onStatusChange?: (status: WorkflowStatus) => void;
}

const stepConfigs = [
  {
    stepNumber: 1,
    name: 'Data Extraction',
    description: 'Extract data from invoice using XML parser if XML exists, otherwise use OCR extraction from PDF',
    icon: '📋'
  },
  {
    stepNumber: 2,
    name: 'Petty Cash Classification',
    description: 'Check if invoice is petty cash based on threshold and skip remaining steps if true',
    icon: '💰'
  },
  {
    stepNumber: 3,
    name: 'Line Item Classification',
    description: 'Perform line item classification only for non-petty cash invoices',
    icon: '🏷️'
  },
  {
    stepNumber: 4,
    name: 'Project Matching',
    description: 'Match invoices to projects based on project validation list',
    icon: '🏗️'
  },
  {
    stepNumber: 5,
    name: 'Validation Rules',
    description: 'Apply validation rules to matched projects',
    icon: '✅'
  },
  {
    stepNumber: 6,
    name: 'PO Matching',
    description: 'Match invoices to POs based on vendor name, amount, and line items',
    icon: '📋'
  },
  {
    stepNumber: 7,
    name: 'Final Database Preparation',
    description: 'Prepare final database with matched Invoice-PO and all relevant information',
    icon: '💾'
  }
];

export function WorkflowStepper({ invoiceId, onStatusChange }: WorkflowStepperProps) {
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executingStep, setExecutingStep] = useState<number | null>(null);

  useEffect(() => {
    loadWorkflowStatus();
  }, [invoiceId]);

  const loadWorkflowStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/invoices/${invoiceId}/workflow/status`);
      if (!response.ok) {
        throw new Error('Failed to load workflow status');
      }
      
      const status: WorkflowStatus = await response.json();
      setWorkflowStatus(status);
      onStatusChange?.(status);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflow status');
    } finally {
      setLoading(false);
    }
  };

  const executeStep = async (stepNumber: number) => {
    try {
      setExecutingStep(stepNumber);
      setError(null);
      
      const response = await fetch(`/api/invoices/${invoiceId}/workflow/execute-step`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          stepNumber,
          mode: 'manual'
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to execute step');
      }
      
      // Reload workflow status
      await loadWorkflowStatus();
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute step');
    } finally {
      setExecutingStep(null);
    }
  };

  const executeCompleteWorkflow = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/invoices/${invoiceId}/workflow/execute-complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config: {
            mode: 'automatic',
            autoRetryAttempts: 3,
            failFast: false,
            loggingLevel: 'detailed'
          }
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to execute complete workflow');
      }
      
      // Reload workflow status
      await loadWorkflowStatus();
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute complete workflow');
    } finally {
      setLoading(false);
    }
  };

  const resetWorkflow = async (stepNumber: number) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/invoices/${invoiceId}/workflow/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ stepNumber }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to reset workflow');
      }
      
      // Reload workflow status
      await loadWorkflowStatus();
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset workflow');
    } finally {
      setLoading(false);
    }
  };

  const getStepStatusIcon = (step: WorkflowStep) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'in_progress':
        return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />;
      case 'skipped':
        return <SkipForward className="h-5 w-5 text-gray-600" />;
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />;
    }
  };

  const getStepStatusColor = (step: WorkflowStep) => {
    switch (step.status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'skipped':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-50 text-gray-600 border-gray-200';
    }
  };

  const canExecuteStep = (stepNumber: number) => {
    if (!workflowStatus) return false;
    
    // Can always execute step 1
    if (stepNumber === 1) return true;
    
    // Check if previous steps are completed
    for (let i = 1; i < stepNumber; i++) {
      const prevStep = workflowStatus.steps.find(s => s.stepNumber === i);
      if (!prevStep || prevStep.status !== 'completed') {
        return false;
      }
    }
    
    return true;
  };

  if (loading && !workflowStatus) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading workflow status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!workflowStatus) {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert>
            <AlertDescription>
              Failed to load workflow status. Please try again.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const completedSteps = workflowStatus.steps.filter(s => s.status === 'completed').length;
  const totalSteps = workflowStatus.steps.length;
  const progressPercentage = (completedSteps / totalSteps) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Invoice Processing Workflow</span>
          <div className="flex items-center gap-2">
            <Badge variant={workflowStatus.overallStatus === 'completed' ? 'default' : 'secondary'}>
              {workflowStatus.overallStatus}
            </Badge>
            <Badge variant="outline">
              {workflowStatus.mode}
            </Badge>
          </div>
        </CardTitle>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Progress: {completedSteps}/{totalSteps} steps completed</span>
            <span>Step {workflowStatus.currentStep} of 7</span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        <div className="flex gap-2 mb-4">
          <Button
            onClick={executeCompleteWorkflow}
            disabled={loading || workflowStatus.overallStatus === 'completed'}
            className="flex-1"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Executing...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Execute Complete Workflow
              </>
            )}
          </Button>
        </div>
        
        <div className="space-y-3">
          {stepConfigs.map((config) => {
            const step = workflowStatus.steps.find(s => s.stepNumber === config.stepNumber);
            const isExecuting = executingStep === config.stepNumber;
            const canExecute = canExecuteStep(config.stepNumber);
            
            return (
              <div
                key={config.stepNumber}
                className={`p-4 rounded-lg border transition-colors ${
                  step?.status === 'completed' ? 'border-green-200 bg-green-50' :
                  step?.status === 'failed' ? 'border-red-200 bg-red-50' :
                  step?.status === 'in_progress' ? 'border-blue-200 bg-blue-50' :
                  'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="flex-shrink-0">
                      {getStepStatusIcon(step || { status: 'pending' } as WorkflowStep)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{config.icon}</span>
                        <h4 className="font-medium text-gray-900">
                          Step {config.stepNumber}: {config.name}
                        </h4>
                        <Badge variant="outline" className={getStepStatusColor(step || { status: 'pending' } as WorkflowStep)}>
                          {step?.status || 'pending'}
                        </Badge>
                      </div>
                      
                      <p className="text-sm text-gray-600 mb-2">
                        {config.description}
                      </p>
                      
                      {step?.result && (
                        <div className="text-xs text-gray-500 bg-gray-100 p-2 rounded">
                          <strong>Result:</strong> {JSON.stringify(step.result, null, 2)}
                        </div>
                      )}
                      
                      {step?.errorMessage && (
                        <div className="text-xs text-red-600 bg-red-100 p-2 rounded mt-2">
                          <strong>Error:</strong> {step.errorMessage}
                        </div>
                      )}
                      
                      {step?.executionTimeMs && (
                        <div className="text-xs text-gray-500 mt-1">
                          Execution time: {step.executionTimeMs}ms
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {step?.status === 'failed' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => resetWorkflow(config.stepNumber)}
                        disabled={loading}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Reset
                      </Button>
                    )}
                    
                    <Button
                      size="sm"
                      onClick={() => executeStep(config.stepNumber)}
                      disabled={!canExecute || isExecuting || step?.status === 'completed' || step?.status === 'skipped'}
                    >
                      {isExecuting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
