import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Alert, AlertDescription } from './ui/alert';
import { Loader2, CheckCircle, XCircle, Play, RotateCcw, AlertTriangle } from 'lucide-react';
import { useToast } from '../hooks/use-toast';

interface WorkflowStep {
  stepNumber: number;
  name: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result?: any;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  executionTimeMs?: number;
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
  onWorkflowComplete?: () => void;
}

const stepConfigs = [
  {
    stepNumber: 1,
    name: 'Data Extraction',
    description: 'Extract data from invoice using XML parser or OCR',
    icon: '📄'
  },
  {
    stepNumber: 2,
    name: 'Petty Cash Classification',
    description: 'Check if invoice is petty cash based on threshold',
    icon: '💰'
  },
  {
    stepNumber: 3,
    name: 'Line Item Classification',
    description: 'Perform line item classification for non-petty cash invoices',
    icon: '🏷️'
  },
  {
    stepNumber: 4,
    name: 'Project Matching',
    description: 'Match invoices to projects based on validation list',
    icon: '🎯'
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
    description: 'Match invoices to POs based on vendor, amount, and line items',
    icon: '📋'
  },
  {
    stepNumber: 7,
    name: 'Final Database Preparation',
    description: 'Prepare final database with all workflow results',
    icon: '💾'
  }
];

export function WorkflowStepper({ invoiceId, onWorkflowComplete }: WorkflowStepperProps) {
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [executingStep, setExecutingStep] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadWorkflowStatus();
  }, [invoiceId]);

  const loadWorkflowStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/invoices/${invoiceId}/workflow/status`);
      if (response.ok) {
        const status = await response.json();
        setWorkflowStatus(status);
      } else {
        throw new Error('Failed to load workflow status');
      }
    } catch (error) {
      console.error('Error loading workflow status:', error);
      toast({
        title: 'Error',
        description: 'Failed to load workflow status',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const executeStep = async (stepNumber: number) => {
    try {
      setExecutingStep(stepNumber);
      
      const response = await fetch(`/api/invoices/${stepNumber}/workflow/execute-step`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          stepNumber,
          mode: 'manual'
        }),
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: 'Success',
          description: `Step ${stepNumber} executed successfully`,
        });
        
        // Reload workflow status
        await loadWorkflowStatus();
        
        // Check if workflow is complete
        if (result.result?.workflowCompleted) {
          onWorkflowComplete?.();
        }
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to execute step');
      }
    } catch (error) {
      console.error(`Error executing step ${stepNumber}:`, error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to execute step',
        variant: 'destructive'
      });
    } finally {
      setExecutingStep(null);
    }
  };

  const executeCompleteWorkflow = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`/api/invoices/${invoiceId}/workflow/execute-complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config: {
            mode: 'automatic',
            failFast: false,
            loggingLevel: 'detailed'
          }
        }),
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: 'Success',
          description: result.message,
        });
        
        await loadWorkflowStatus();
        
        if (result.success) {
          onWorkflowComplete?.();
        }
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to execute complete workflow');
      }
    } catch (error) {
      console.error('Error executing complete workflow:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to execute complete workflow',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const resetWorkflow = async (stepNumber: number) => {
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/workflow/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ stepNumber }),
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: `Workflow reset to step ${stepNumber}`,
        });
        await loadWorkflowStatus();
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to reset workflow');
      }
    } catch (error) {
      console.error('Error resetting workflow:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to reset workflow',
        variant: 'destructive'
      });
    }
  };

  const getStepStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'in_progress':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'skipped':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />;
    }
  };

  const getStepStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'skipped':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getOverallProgress = () => {
    if (!workflowStatus?.steps) return 0;
    const completedSteps = workflowStatus.steps.filter(step => step.status === 'completed').length;
    return (completedSteps / 7) * 100;
  };

  if (loading && !workflowStatus) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading Workflow Status...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (!workflowStatus) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Workflow Status</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              Unable to load workflow status. Please try again.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Invoice Processing Workflow</CardTitle>
          <div className="flex gap-2">
            <Button
              onClick={executeCompleteWorkflow}
              disabled={loading || workflowStatus.overallStatus === 'completed'}
              variant="outline"
              size="sm"
            >
              <Play className="h-4 w-4 mr-2" />
              Execute All
            </Button>
            <Button
              onClick={() => loadWorkflowStatus()}
              disabled={loading}
              variant="outline"
              size="sm"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Overall Progress</span>
            <span>{Math.round(getOverallProgress())}%</span>
          </div>
          <Progress value={getOverallProgress()} className="h-2" />
          <div className="flex items-center gap-2 text-sm">
            <Badge variant={workflowStatus.overallStatus === 'completed' ? 'default' : 'secondary'}>
              {workflowStatus.overallStatus.replace('_', ' ').toUpperCase()}
            </Badge>
            <span className="text-gray-600">
              Current Step: {workflowStatus.currentStep}/7
            </span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {stepConfigs.map((stepConfig) => {
            const step = workflowStatus.steps.find(s => s.stepNumber === stepConfig.stepNumber);
            const isExecuting = executingStep === stepConfig.stepNumber;
            const canExecute = step?.status === 'pending' || step?.status === 'failed';
            
            return (
              <div
                key={stepConfig.stepNumber}
                className={`p-4 border rounded-lg ${
                  step?.status === 'completed' ? 'border-green-200 bg-green-50' :
                  step?.status === 'failed' ? 'border-red-200 bg-red-50' :
                  step?.status === 'in_progress' ? 'border-blue-200 bg-blue-50' :
                  'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="text-2xl">{stepConfig.icon}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium">{stepConfig.name}</h3>
                        {getStepStatusIcon(step?.status || 'pending')}
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{stepConfig.description}</p>
                      
                      {step?.result && (
                        <div className="text-xs bg-white p-2 rounded border">
                          <strong>Result:</strong> {JSON.stringify(step.result, null, 2)}
                        </div>
                      )}
                      
                      {step?.error && (
                        <div className="text-xs bg-red-50 p-2 rounded border border-red-200 text-red-700">
                          <strong>Error:</strong> {step.error}
                        </div>
                      )}
                      
                      {step?.executionTimeMs && (
                        <div className="text-xs text-gray-500 mt-1">
                          Execution time: {step.executionTimeMs}ms
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-2 ml-4">
                    {canExecute && (
                      <Button
                        onClick={() => executeStep(stepConfig.stepNumber)}
                        disabled={isExecuting}
                        size="sm"
                        variant="outline"
                      >
                        {isExecuting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                        Execute
                      </Button>
                    )}
                    
                    {step?.status === 'completed' && (
                      <Button
                        onClick={() => resetWorkflow(stepConfig.stepNumber)}
                        size="sm"
                        variant="outline"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Reset
                      </Button>
                    )}
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
