
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { CheckCircle, Clock, AlertTriangle, XCircle, Play, Pause, Download, RefreshCw } from 'lucide-react';

interface ProcessingStep {
  step_id: number;
  step_name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  processing_time?: number;
  success?: boolean;
  description?: string;
  confidence?: number;
}

interface WorkflowResult {
  workflow_id: string;
  success: boolean;
  processing_complete: boolean;
  processing_time_seconds: number;
  quality_score: number;
  invoice_record: {
    id: string;
    status: string;
    confidence_score: number;
    requires_approval: boolean;
    assigned_project?: string;
    matched_po?: string;
    total_amount: number;
    currency: string;
  };
  step_results: Record<string, any>;
  performance_metrics: {
    total_steps: number;
    completed_steps: number;
    success_rate: number;
    automation_rate: number;
  };
}

const AutomaticProcessingInterface: React.FC = () => {
  const [workflowResult, setWorkflowResult] = useState<WorkflowResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([
    { step_id: 1, step_name: 'ERP Import', status: 'pending', description: 'Import invoices from ERP system' },
    { step_id: 2, step_name: 'OCR Processing', status: 'pending', description: 'Extract text from documents' },
    { step_id: 3, step_name: 'AI Data Extraction', status: 'pending', description: 'Extract structured data using AI' },
    { step_id: 4, step_name: 'Business Rules Validation', status: 'pending', description: 'Validate against business rules' },
    { step_id: 5, step_name: 'Project Matching', status: 'pending', description: 'Match invoices to projects' },
    { step_id: 6, step_name: 'PO Matching', status: 'pending', description: 'Match with purchase orders' },
    { step_id: 7, step_name: 'Line Item Classification', status: 'pending', description: 'Classify invoice line items' },
    { step_id: 8, step_name: 'Approval Routing', status: 'pending', description: 'Route for approvals' },
    { step_id: 9, step_name: 'Discrepancy Detection', status: 'pending', description: 'Detect discrepancies' },
    { step_id: 10, step_name: 'Final Processing', status: 'pending', description: 'Final processing and storage' },
    { step_id: 11, step_name: 'Petty Cash Evaluation', status: 'pending', description: 'Evaluate petty cash transactions' },
    { step_id: 12, step_name: 'Learning & Optimization', status: 'pending', description: 'Update ML models' }
  ]);

  const startAutomaticProcessing = async () => {
    setIsProcessing(true);
    setCurrentStep(0);
    setLogs(['🚀 Starting Anzu Dynamics Automatic Invoice Processing Workflow...']);
    
    // Reset all steps
    setProcessingSteps(steps => steps.map(step => ({ ...step, status: 'pending' })));

    try {
      const response = await fetch('/api/invoices/run-comprehensive-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: 'AUTO_BATCH_' + Date.now(),
          file_path: '/tmp/automatic_processing_batch.pdf',
          user_id: 'current_user'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to start processing');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(Boolean);

          for (const line of lines) {
            if (line.startsWith('STEP_UPDATE:')) {
              const stepData = JSON.parse(line.replace('STEP_UPDATE:', ''));
              updateStepStatus(stepData.step_id, stepData.status, stepData.processing_time);
              setCurrentStep(stepData.step_id);
            } else if (line.startsWith('LOG:')) {
              const logMessage = line.replace('LOG:', '');
              setLogs(prev => [...prev, logMessage]);
            } else if (line.startsWith('FINAL_RESULT:')) {
              const finalResult = JSON.parse(line.replace('FINAL_RESULT:', ''));
              setWorkflowResult(finalResult);
            }
          }
        }
      }
    } catch (error) {
      console.error('Processing error:', error);
      setLogs(prev => [...prev, `❌ Error: ${error}`]);
    } finally {
      setIsProcessing(false);
    }
  };

  const updateStepStatus = (stepId: number, status: ProcessingStep['status'], processingTime?: number) => {
    setProcessingSteps(steps => 
      steps.map(step => 
        step.step_id === stepId 
          ? { ...step, status, processing_time: processingTime, success: status === 'completed' }
          : step
      )
    );
  };

  const getStatusIcon = (status: ProcessingStep['status']) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'running': return <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-600" />;
      default: return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: ProcessingStep['status']) => {
    const variants = {
      completed: 'bg-green-100 text-green-800',
      running: 'bg-blue-100 text-blue-800',
      failed: 'bg-red-100 text-red-800',
      pending: 'bg-gray-100 text-gray-800'
    };
    return <Badge className={variants[status]}>{status}</Badge>;
  };

  const calculateProgress = () => {
    const completedSteps = processingSteps.filter(step => step.status === 'completed').length;
    return (completedSteps / processingSteps.length) * 100;
  };

  const exportResults = () => {
    if (!workflowResult) return;
    
    const dataStr = JSON.stringify(workflowResult, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `workflow_results_${workflowResult.workflow_id}.json`;
    link.click();
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Automatic Invoice Processing</h1>
          <p className="text-gray-600">Comprehensive end-to-end invoice processing workflow</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={startAutomaticProcessing} 
            disabled={isProcessing}
            className="flex items-center gap-2"
          >
            {isProcessing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isProcessing ? 'Processing...' : 'Start Processing'}
          </Button>
          {workflowResult && (
            <Button variant="outline" onClick={exportResults}>
              <Download className="h-4 w-4 mr-2" />
              Export Results
            </Button>
          )}
        </div>
      </div>

      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Processing Progress</CardTitle>
          <CardDescription>
            Overall workflow execution progress
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Progress value={calculateProgress()} className="w-full" />
            <div className="flex justify-between text-sm text-gray-600">
              <span>Step {currentStep} of {processingSteps.length}</span>
              <span>{Math.round(calculateProgress())}% Complete</span>
            </div>
            {workflowResult && (
              <div className="grid grid-cols-4 gap-4 mt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {workflowResult.performance_metrics.completed_steps}
                  </div>
                  <div className="text-sm text-gray-600">Completed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {Math.round(workflowResult.performance_metrics.success_rate * 100)}%
                  </div>
                  <div className="text-sm text-gray-600">Success Rate</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {workflowResult.processing_time_seconds}s
                  </div>
                  <div className="text-sm text-gray-600">Processing Time</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {Math.round(workflowResult.quality_score * 100)}%
                  </div>
                  <div className="text-sm text-gray-600">Quality Score</div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="steps">Step Details</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="validation">Validation</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>

        {/* Processing Overview */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {processingSteps.map((step) => (
              <Card key={step.step_id} className={`${currentStep === step.step_id ? 'ring-2 ring-blue-500' : ''}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{step.step_name}</CardTitle>
                    {getStatusIcon(step.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-gray-600 mb-2">{step.description}</p>
                  <div className="flex items-center justify-between">
                    {getStatusBadge(step.status)}
                    {step.processing_time && (
                      <span className="text-xs text-gray-500">{step.processing_time}s</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Step Details */}
        <TabsContent value="steps">
          <Card>
            <CardHeader>
              <CardTitle>Detailed Step Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {processingSteps.map((step) => (
                  <div key={step.step_id} className="border-l-4 border-gray-200 pl-4 py-2">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold">{step.step_name}</h4>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(step.status)}
                        {getStatusBadge(step.status)}
                      </div>
                    </div>
                    <p className="text-sm text-gray-600">{step.description}</p>
                    {step.processing_time && (
                      <p className="text-xs text-gray-500 mt-1">
                        Processing time: {step.processing_time} seconds
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Results */}
        <TabsContent value="results">
          {workflowResult ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Processing Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-lg font-semibold">
                        {workflowResult.invoice_record.id}
                      </div>
                      <div className="text-sm text-gray-600">Invoice ID</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold">
                        {workflowResult.invoice_record.status}
                      </div>
                      <div className="text-sm text-gray-600">Status</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold">
                        {workflowResult.invoice_record.total_amount.toLocaleString()} {workflowResult.invoice_record.currency}
                      </div>
                      <div className="text-sm text-gray-600">Total Amount</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold">
                        {Math.round(workflowResult.invoice_record.confidence_score * 100)}%
                      </div>
                      <div className="text-sm text-gray-600">Confidence</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {workflowResult.invoice_record.assigned_project && (
                <Card>
                  <CardHeader>
                    <CardTitle>Project Assignment</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span>Assigned to project: {workflowResult.invoice_record.assigned_project}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {workflowResult.invoice_record.matched_po && (
                <Card>
                  <CardHeader>
                    <CardTitle>Purchase Order Match</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span>Matched with PO: {workflowResult.invoice_record.matched_po}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-gray-600">No results available. Start processing to see results.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Validation */}
        <TabsContent value="validation">
          <Card>
            <CardHeader>
              <CardTitle>Validation Results</CardTitle>
            </CardHeader>
            <CardContent>
              {workflowResult?.step_results?.validation ? (
                <div className="space-y-4">
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      Validation Score: {Math.round(workflowResult.step_results.validation.validation_score * 100)}%
                    </AlertDescription>
                  </Alert>
                  
                  <div>
                    <h4 className="font-semibold mb-2">Rules Checked:</h4>
                    <ul className="list-disc list-inside space-y-1">
                      {workflowResult.step_results.validation.rules_checked?.map((rule: string, index: number) => (
                        <li key={index} className="text-sm">{rule}</li>
                      ))}
                    </ul>
                  </div>

                  {workflowResult.step_results.validation.warnings?.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2">Warnings:</h4>
                      {workflowResult.step_results.validation.warnings.map((warning: any, index: number) => (
                        <Alert key={index} className="mb-2">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>{warning.message}</AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-600">Validation results will appear here after processing.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Logs */}
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>Processing Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-50 p-4 rounded-md max-h-96 overflow-y-auto">
                {logs.length > 0 ? (
                  <div className="space-y-1">
                    {logs.map((log, index) => (
                      <div key={index} className="text-sm font-mono">
                        {log}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600">Processing logs will appear here...</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Actions */}
        <TabsContent value="actions">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Processing Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  onClick={startAutomaticProcessing} 
                  disabled={isProcessing}
                  className="w-full"
                >
                  {isProcessing ? 'Stop Processing' : 'Start New Processing'}
                </Button>
                <Button variant="outline" className="w-full" disabled={!workflowResult}>
                  Review Flagged Items
                </Button>
                <Button variant="outline" className="w-full" disabled={!workflowResult}>
                  Initiate Approval Workflow
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Export & Reports</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  variant="outline" 
                  onClick={exportResults}
                  disabled={!workflowResult}
                  className="w-full"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export JSON Results
                </Button>
                <Button variant="outline" className="w-full" disabled={!workflowResult}>
                  Generate PDF Report
                </Button>
                <Button variant="outline" className="w-full" disabled={!workflowResult}>
                  Export to Excel
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AutomaticProcessingInterface;
