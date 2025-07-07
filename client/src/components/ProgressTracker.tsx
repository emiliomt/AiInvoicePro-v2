import React from 'react';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { CheckCircle, Clock, AlertCircle, Play, Database, Download, FileText, Settings } from 'lucide-react';

interface ProgressStep {
  id: number;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  timestamp: Date;
}

interface ProgressData {
  taskId: number;
  currentStep: number;
  totalSteps: number;
  steps: ProgressStep[];
  totalInvoices: number;
  processedInvoices: number;
  successfulImports: number;
  failedImports: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
}

interface ProgressTrackerProps {
  progress?: ProgressData;
  isVisible: boolean;
}

const getStepIcon = (step: ProgressStep) => {
  const iconProps = { className: "w-4 h-4" };

  // Map step descriptions to appropriate icons
  if (step.description.toLowerCase().includes('browser') || step.description.toLowerCase().includes('initializing')) {
    return <Settings {...iconProps} />;
  }
  if (step.description.toLowerCase().includes('login') || step.description.toLowerCase().includes('navigating')) {
    return <Play {...iconProps} />;
  }
  if (step.description.toLowerCase().includes('download') || step.description.toLowerCase().includes('extract')) {
    return <Download {...iconProps} />;
  }
  if (step.description.toLowerCase().includes('invoice') || step.description.toLowerCase().includes('document')) {
    return <FileText {...iconProps} />;
  }
  if (step.description.toLowerCase().includes('storing') || step.description.toLowerCase().includes('processing')) {
    return <Database {...iconProps} />;
  }

  return <Clock {...iconProps} />;
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    case 'running':
      return <Clock className="w-5 h-5 text-blue-500 animate-spin" />;
    case 'failed':
      return <AlertCircle className="w-5 h-5 text-red-500" />;
    default:
      return <Clock className="w-5 h-5 text-gray-400" />;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'bg-green-100 border-green-200';
    case 'running':
      return 'bg-blue-100 border-blue-200';
    case 'failed':
      return 'bg-red-100 border-red-200';
    default:
      return 'bg-gray-50 border-gray-200';
  }
};

export const ProgressTracker: React.FC<ProgressTrackerProps> = ({ progress, isVisible }) => {
  if (!isVisible || !progress) return null;

  const overallProgress = (progress.currentStep / progress.totalSteps) * 100;
  const invoiceProgress = progress.totalInvoices > 0 ? (progress.processedInvoices / progress.totalInvoices) * 100 : 0;

  return (
    <div className="bg-white border rounded-lg p-6 space-y-6">
      {/* Header with ERP Logo */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <Database className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">ERP Invoice Import</h3>
            <p className="text-sm text-gray-500">Task #{progress.taskId}</p>
          </div>
        </div>
        <Badge variant={progress.status === 'completed' ? 'default' : progress.status === 'failed' ? 'destructive' : 'secondary'}>
          {progress.status.charAt(0).toUpperCase() + progress.status.slice(1)}
        </Badge>
      </div>

      {/* Overall Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">Overall Progress</span>
          <span className="text-gray-500">Step {progress.currentStep} of {progress.totalSteps}</span>
        </div>
        <Progress value={overallProgress} className="h-3" />
        <div className="text-xs text-gray-500 text-right">{Math.round(overallProgress)}% complete</div>
      </div>

      {/* Invoice Progress Bar (if applicable) */}
      {progress.totalInvoices > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Invoices Processed</span>
            <span className="text-gray-500">{progress.processedInvoices} of {progress.totalInvoices}</span>
          </div>
          <Progress value={invoiceProgress} className="h-3" />
          <div className="flex justify-between text-xs text-gray-500">
            <span>{Math.round(invoiceProgress)}% complete</span>
            <div className="space-x-4">
              <span className="text-green-600">✓ {progress.successfulImports} success</span>
              {progress.failedImports > 0 && (
                <span className="text-red-600">✗ {progress.failedImports} failed</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step Details */}
      <div className="space-y-3">
        <h4 className="font-medium text-sm text-gray-700">Progress Details</h4>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {progress.steps.map((step) => (
            <div 
              key={step.id}
              className={`flex items-center space-x-3 p-3 rounded-lg border transition-all ${getStatusColor(step.status)}`}
            >
              <div className="flex items-center space-x-2">
                {getStepIcon(step)}
                {getStatusIcon(step.status)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {step.description}
                </p>
                <p className="text-xs text-gray-500">
                  {step.timestamp.toLocaleTimeString()}
                </p>
              </div>
              <div className="flex-shrink-0">
                <span className={`inline-flex px-2 py-1 text-xs rounded-full font-medium ${
                  step.status === 'completed' ? 'bg-green-100 text-green-800' :
                  step.status === 'running' ? 'bg-blue-100 text-blue-800' :
                  step.status === 'failed' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {step.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Timing Information */}
      <div className="flex justify-between text-xs text-gray-500 pt-4 border-t">
        <span>Started: {progress.startedAt.toLocaleTimeString()}</span>
        {progress.completedAt && (
          <span>Completed: {progress.completedAt.toLocaleTimeString()}</span>
        )}
      </div>
    </div>
  );
};