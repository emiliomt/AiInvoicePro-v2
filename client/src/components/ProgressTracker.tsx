import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Button } from './ui/button';
import { CheckCircle, Clock, AlertCircle, Loader2, X, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';

interface ProgressStep {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  timestamp?: string;
  details?: string;
  screenshot?: string;
}

interface ImportProgress {
  id: number;
  configId: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalInvoices: number;
  processedInvoices: number;
  successfulImports: number;
  failedImports: number;
  steps: ProgressStep[];
  logs: string;
  screenshots: string[];
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  executionTime?: number;
}

interface ProgressTrackerProps {
  isOpen: boolean;
  onClose: () => void;
  configId: number;
  configName: string;
  jobId?: number; // logId for RPA progress tracking
}

export default function ProgressTracker({ isOpen, onClose, configId, configName, jobId }: ProgressTrackerProps) {
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    if (isOpen && configId) {
      initializeConnection();
    } else {
      cleanup();
    }

    return () => cleanup();
  }, [isOpen, configId]);

  const initializeConnection = () => {
    // Try WebSocket first, fallback to polling
    connectWebSocket();
    // Also start polling as backup - start immediately to catch any existing progress
    startPolling();
  };

  const connectWebSocket = () => {
    try {
      setConnectionStatus('connecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      const websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        console.log('WebSocket connected');
        setConnectionStatus('connected');
        setWs(websocket);

        // Subscribe to progress updates
        websocket.send(JSON.stringify({
          type: 'subscribe',
          userId: 'current-user', // This should be actual user ID
          configId: configId
        }));
      };

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message received:', data);

          if (data.type === 'progress' && data.configId === configId) {
            handleProgressUpdate(data);
          } else if (data.type === 'task_complete' && data.configId === configId) {
            handleTaskComplete(data);
          } else if (data.type === 'error') {
            console.error('WebSocket error:', data.message);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      websocket.onclose = () => {
        console.log('WebSocket disconnected');
        setConnectionStatus('disconnected');
        setWs(null);

        // Retry connection after 3 seconds
        setTimeout(() => {
          if (isOpen && configId) {
            connectWebSocket();
          }
        }, 3000);
      };

      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('error');
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionStatus('error');
    }
  };

  const handleProgressUpdate = (data: any) => {
    setProgress(prevProgress => {
      if (!prevProgress) {
        return data;
      }

      return {
        ...prevProgress,
        ...data,
        steps: data.steps || prevProgress.steps,
        screenshots: data.screenshots || prevProgress.screenshots
      };
    });
  };

  const handleTaskComplete = (data: any) => {
    setProgress(prevProgress => {
      if (!prevProgress) return null;

      return {
        ...prevProgress,
        status: data.success ? 'completed' : 'failed',
        errorMessage: data.success ? undefined : data.message,
        completedAt: data.timestamp
      };
    });

    // Stop polling when task is complete
    setIsPolling(false);
  };

  const cleanup = () => {
    setIsPolling(false);
    if (ws) {
      ws.close();
      setWs(null);
    }
    setConnectionStatus('disconnected');
  };

  const startPolling = () => {
    console.log(`🚀 Starting progress polling for configId: ${configId}, jobId: ${jobId}`);
    setIsPolling(true);
    pollProgress();
  };

  const stopPolling = () => {
    setIsPolling(false);
  };

  const pollProgress = async () => {
    if (!isPolling) return;

    try {
      // Use jobId if available (for RPA progress), otherwise use configId
      const progressId = jobId || configId;
      let apiEndpoint = '';
      
      if (jobId) {
        // Use RPA progress endpoint for jobId
        apiEndpoint = `/api/rpa/progress/${jobId}`;
        console.log(`🔄 Polling RPA progress for jobId: ${jobId}`);
      } else {
        // Use invoice importer progress endpoint for configId
        apiEndpoint = `/api/invoice-importer/progress/${configId}`;
        console.log(`🔄 Polling invoice importer progress for configId: ${configId}`);
      }
      
      const response = await fetch(apiEndpoint, {
        credentials: 'include',
      });

      if (!response.ok) {
        console.error(`❌ Progress API error: ${response.status} ${response.statusText}`);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      let convertedProgress: ImportProgress;
      
      if (jobId) {
        // Handle RPA progress format
        console.log('✅ RPA Progress update received:', {
          status: data.status,
          stage: data.stage,
          progressPercent: data.progressPercent,
          total: data.total,
          processed: data.processed,
          success: data.success,
          failed: data.failed
        });

        convertedProgress = {
          id: progressId,
          configId: configId,
          status: data.status as 'pending' | 'running' | 'completed' | 'failed',
          totalInvoices: data.total || 0,
          processedInvoices: data.processed || 0,
          successfulImports: data.success || 0,
          failedImports: data.failed || 0,
          steps: [{
            id: 'current',
            title: data.stage || 'Processing...',
            status: data.status === 'running' ? 'running' : 
                    data.status === 'completed' ? 'completed' : 
                    data.status === 'failed' ? 'failed' : 'pending',
            timestamp: new Date().toISOString(),
            details: `${data.processed || 0}/${data.total || 0} files processed`
          }],
          logs: data.stage || 'Processing...',
          screenshots: [],
          errorMessage: data.error,
          startedAt: new Date().toISOString()
        };
      } else {
        // Handle invoice importer progress format
        console.log('✅ Invoice Importer Progress update received:', {
          isRunning: data.isRunning,
          progress: data.progress,
          currentStep: data.currentStep,
          stats: data.stats
        });

        convertedProgress = {
          id: progressId,
          configId: configId,
          status: data.isRunning ? 'running' : (data.progress === 100 ? 'completed' : 'pending'),
          totalInvoices: data.stats?.total_invoices || 0,
          processedInvoices: data.stats?.processed_invoices || 0,
          successfulImports: data.stats?.successful_imports || 0,
          failedImports: data.stats?.failed_imports || 0,
          steps: [{
            id: 'current',
            title: data.currentStep || 'Processing...',
            status: data.isRunning ? 'running' : (data.progress === 100 ? 'completed' : 'pending'),
            timestamp: new Date().toISOString(),
            details: `Progress: ${data.progress}%`
          }],
          logs: data.currentStep || 'Processing...',
          screenshots: [],
          errorMessage: undefined,
          startedAt: new Date().toISOString()
        };
      }

      setProgress(convertedProgress);

      // Stop polling if completed or failed
      if (convertedProgress.status === 'completed' || convertedProgress.status === 'failed') {
        console.log(`Import ${convertedProgress.status}, stopping progress polling`);
        setIsPolling(false);
        return;
      }
    } catch (error) {
      console.error('Error polling progress:', error);

      // Only show error if we haven't received any progress yet
      if (!progress || progress.status === 'pending') {
        setProgress({
          id: 0,
          configId,
          status: 'failed',
          totalInvoices: 0,
          processedInvoices: 0,
          successfulImports: 0,
          failedImports: 0,
          steps: [{
            id: 'error',
            title: 'Connection error',
            status: 'failed',
            timestamp: new Date().toISOString(),
            details: error instanceof Error ? error.message : 'Unknown error'
          }],
          logs: `Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          screenshots: [],
          errorMessage: `Failed to connect to server: ${error instanceof Error ? error.message : 'Unknown error'}`,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          executionTime: 0
        });
        setIsPolling(false);
      }
    }

    // Continue polling if still running
    if (isPolling) {
      setTimeout(() => pollProgress(), 5000); // Poll every 5 seconds to reduce UI flickeringonds
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: 'bg-gray-100 text-gray-800',
      running: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800'
    };
    return variants[status as keyof typeof variants] || variants.pending;
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const calculateProgress = () => {
    if (!progress) return 0;
    if (progress.totalInvoices === 0) return 0;
    return (progress.processedInvoices / progress.totalInvoices) * 100;
  };

  const getAutomationSteps = () => {
    const automationSteps = [
      { id: 'browser', shortTitle: 'Browser', fullTitle: 'Initialize Browser' },
      { id: 'login', shortTitle: 'Login', fullTitle: 'ERP Login' },
      { id: 'navigate', shortTitle: 'Navigate', fullTitle: 'Navigate to FE Module' },
      { id: 'search', shortTitle: 'Search', fullTitle: 'Find Invoice List' },
      { id: 'extract', shortTitle: 'Extract', fullTitle: 'Extract Invoice Data' },
      { id: 'download', shortTitle: 'Download', fullTitle: 'Download Invoices' },
      { id: 'process', shortTitle: 'Process', fullTitle: 'Process XML Files' },
      { id: 'classify', shortTitle: 'Classify', fullTitle: 'Classify Items' },
      { id: 'validate', shortTitle: 'Validate', fullTitle: 'Validate Data' },
      { id: 'complete', shortTitle: 'Complete', fullTitle: 'Finalize Import' }
    ];

    return automationSteps.map((step, index) => {
      let status: 'pending' | 'running' | 'completed' | 'failed' = 'pending';
      let details = '';

      if (!progress?.steps || progress.steps.length === 0) {
        return { ...step, status, details };
      }

      // Map current progress to automation steps
      const currentLog = progress.logs || '';
      const currentStep = progress.steps[progress.steps.length - 1];

      // Determine status based on current progress
      if (currentLog.includes('Initializing browser') || currentLog.includes('Setting up Chrome')) {
        if (step.id === 'browser') status = 'running';
        else if (index < 1) status = 'completed';
      } else if (currentLog.includes('Logging into ERP') || currentLog.includes('Login successful')) {
        if (step.id === 'login') status = 'running';
        else if (index < 2) status = 'completed';
      } else if (currentLog.includes('Navigating to') || currentLog.includes('Navigate to FE')) {
        if (step.id === 'navigate') status = 'running';
        else if (index < 3) status = 'completed';
      } else if (currentLog.includes('Finding invoice') || currentLog.includes('Loading invoice list')) {
        if (step.id === 'search') status = 'running';
        else if (index < 4) status = 'completed';
      } else if (currentLog.includes('Found') && currentLog.includes('rows')) {
        if (step.id === 'extract') status = 'running';
        else if (index < 5) status = 'completed';
      } else if (currentLog.includes('Downloading') || currentLog.includes('Downloaded:')) {
        if (step.id === 'download') status = 'running';
        else if (index < 6) status = 'completed';
        if (step.id === 'download') {
          details = `${progress.processedInvoices}/${progress.totalInvoices} files`;
        }
      } else if (currentLog.includes('Processing XML') || currentLog.includes('Extracting XML')) {
        if (step.id === 'process') status = 'running';
        else if (index < 7) status = 'completed';
      } else if (currentLog.includes('Classifying') || currentLog.includes('Classification')) {
        if (step.id === 'classify') status = 'running';
        else if (index < 8) status = 'completed';
      } else if (currentLog.includes('Validating') || currentLog.includes('Validation')) {
        if (step.id === 'validate') status = 'running';
        else if (index < 9) status = 'completed';
      } else if (progress.status === 'completed') {
        if (index < 10) status = 'completed';
      }

      // Handle failures
      if (progress.status === 'failed' && currentStep?.status === 'failed') {
        const failedStepMap: Record<string, string[]> = {
          'browser': ['browser', 'chrome', 'initialization'],
          'login': ['login', 'credential', 'authentication'],
          'navigate': ['navigate', 'navigation', 'module'],
          'search': ['search', 'find', 'invoice list'],
          'extract': ['extract', 'data extraction'],
          'download': ['download', 'file'],
          'process': ['process', 'xml', 'parsing'],
          'classify': ['classify', 'classification'],
          'validate': ['validate', 'validation']
        };

        for (const [stepId, keywords] of Object.entries(failedStepMap)) {
          if (keywords.some(keyword => currentLog.toLowerCase().includes(keyword.toLowerCase()))) {
            if (step.id === stepId) {
              status = 'failed';
              details = progress.errorMessage || 'Step failed';
            }
            break;
          }
        }
      }

      return { 
        ...step, 
        status, 
        details: details || (currentStep?.details || ''),
        title: step.fullTitle
      };
    });
  };

  const getAutomationStepNumber = () => {
    const steps = getAutomationSteps();
    const completedSteps = steps.filter(step => step.status === 'completed').length;
    const runningSteps = steps.filter(step => step.status === 'running').length;
    return completedSteps + (runningSteps > 0 ? 1 : 0);
  };

  const getCurrentStep = () => {
    const steps = getAutomationSteps();
    return steps.find(step => step.status === 'running');
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Import Progress - {configName}</DialogTitle>
              <div className="flex items-center gap-2">
                {/* Connection Status Indicator */}
                <div className="flex items-center gap-1 text-xs">
                  <div className={`w-2 h-2 rounded-full ${
                    connectionStatus === 'connected' ? 'bg-green-500' : 
                    connectionStatus === 'connecting' ? 'bg-yellow-500' : 
                    connectionStatus === 'error' ? 'bg-red-500' : 'bg-gray-400'
                  }`} />
                  <span className="capitalize text-gray-600">{connectionStatus}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={onClose}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          {progress ? (
            <div className="space-y-6">
              {/* Overall Progress */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Overall Progress</CardTitle>
                    <Badge className={getStatusBadge(progress.status)}>
                      {progress.status.toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{progress.totalInvoices}</div>
                      <div className="text-sm text-gray-500">Total Invoices</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-600">{progress.processedInvoices}</div>
                      <div className="text-sm text-gray-500">Processed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{progress.successfulImports}</div>
                      <div className="text-sm text-gray-500">Successful</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">{progress.failedImports}</div>
                      <div className="text-sm text-gray-500">Failed</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progress</span>
                      <span>{Math.round(calculateProgress())}%</span>
                    </div>
                    <Progress value={calculateProgress()} className="h-2" />
                  </div>

                  {progress.executionTime && (
                    <div className="text-sm text-gray-500">
                      Execution Time: {formatDuration(progress.executionTime)}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Step-by-Step Progress */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Automation Steps Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* Visual Step Progress Bar */}
                    <div className="relative">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-sm font-medium text-gray-700">Automation Progress</span>
                        <span className="text-sm text-gray-500">{getAutomationStepNumber()}/10 Steps</span>
                      </div>
                      
                      {/* Progress Line */}
                      <div className="relative">
                        <div className="absolute top-5 left-0 w-full h-0.5 bg-gray-200"></div>
                        <div 
                          className="absolute top-5 left-0 h-0.5 bg-blue-500 transition-all duration-500"
                          style={{ width: `${(getAutomationStepNumber() / 10) * 100}%` }}
                        ></div>
                        
                        {/* Step Circles */}
                        <div className="relative flex justify-between">
                          {getAutomationSteps().map((step, index) => (
                            <div key={step.id} className="flex flex-col items-center">
                              <div className={`
                                w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-medium
                                ${step.status === 'completed' ? 'bg-green-500 border-green-500 text-white' :
                                  step.status === 'running' ? 'bg-blue-500 border-blue-500 text-white animate-pulse' :
                                  step.status === 'failed' ? 'bg-red-500 border-red-500 text-white' :
                                  'bg-white border-gray-300 text-gray-400'}
                              `}>
                                {step.status === 'completed' ? (
                                  <CheckCircle className="w-5 h-5" />
                                ) : step.status === 'running' ? (
                                  <Loader2 className="w-5 h-5 animate-spin" />
                                ) : step.status === 'failed' ? (
                                  <AlertCircle className="w-5 h-5" />
                                ) : (
                                  index + 1
                                )}
                              </div>
                              <div className="mt-2 text-center max-w-20">
                                <div className="text-xs font-medium text-gray-700 leading-tight">
                                  {step.shortTitle}
                                </div>
                                {step.status === 'running' && (
                                  <div className="text-xs text-blue-600 mt-1">
                                    {step.details && step.details.length > 30 
                                      ? `${step.details.substring(0, 30)}...` 
                                      : step.details}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Detailed Step Information */}
                    <div className="space-y-4 max-h-96 overflow-y-auto">
                      {progress.steps && progress.steps.length > 0 ? (
                        progress.steps.map((step, index) => (
                          <div key={step.id} className="flex items-start space-x-3 p-3 rounded-lg bg-gray-50">
                            <div className="flex-shrink-0 mt-1">
                              {getStatusIcon(step.status)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium text-gray-900">{step.title}</h4>
                                <Badge className={getStatusBadge(step.status)} variant="secondary">
                                  {step.status}
                                </Badge>
                              </div>
                              {step.details && (
                                <p className="text-sm text-gray-600 mt-1">{step.details}</p>
                              )}
                              {step.timestamp && (
                                <p className="text-xs text-gray-500 mt-1">
                                  {new Date(step.timestamp).toLocaleTimeString()}
                                </p>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
                          <p>Initializing import process...</p>
                        </div>
                      )}
                    </div>

                    {/* Current Step Highlight */}
                    {getCurrentStep() && (
                      <div className="border-l-4 border-blue-500 bg-blue-50 p-4 rounded-r-lg">
                        <div className="flex items-center">
                          <Loader2 className="w-5 h-5 text-blue-500 animate-spin mr-2" />
                          <div>
                            <h4 className="text-sm font-medium text-blue-800">
                              Currently Processing: {getCurrentStep()?.title}
                            </h4>
                            {getCurrentStep()?.details && (
                              <p className="text-sm text-blue-600 mt-1">
                                {getCurrentStep()?.details}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Screenshots */}
              {progress.screenshots && progress.screenshots.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Screenshots</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {progress.screenshots.map((screenshot, index) => (
                        <div key={index} className="relative">
                          <img
                            src={screenshot}
                            alt={`Screenshot ${index + 1}`}
                            className="w-full h-32 object-cover rounded-lg border cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => setSelectedScreenshot(screenshot)}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute top-2 right-2 bg-white/80 hover:bg-white/90"
                            onClick={() => setSelectedScreenshot(screenshot)}
                          >
                            <Eye className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Error Message */}
              {progress.errorMessage && (
                <Card className="border-red-200 bg-red-50">
                  <CardHeader>
                    <CardTitle className="text-lg text-red-800">Error Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-red-700">{progress.errorMessage}</p>
                  </CardContent>
                </Card>
              )}

              {/* Raw Logs */}
              {progress.logs && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Detailed Logs</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs bg-gray-100 p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
                      {progress.logs}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-blue-600" />
              <p className="text-gray-600">Loading import progress...</p>
              <div className="mt-4 text-sm text-gray-500 space-y-1">
                <p>Config ID: {configId}</p>
                <p>Connection: {connectionStatus}</p>
                <p>Polling: {isPolling ? 'Active' : 'Inactive'}</p>
                <p>Time: {new Date().toLocaleTimeString()}</p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-4"
                onClick={() => {
                  console.log('Force refresh progress');
                  pollProgress();
                }}
              >
                Refresh Progress
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Screenshot Modal */}
      <Dialog open={!!selectedScreenshot} onOpenChange={() => setSelectedScreenshot(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Screenshot</DialogTitle>
          </DialogHeader>
          {selectedScreenshot && (
            <div className="max-h-[80vh] overflow-auto">
              <img
                src={selectedScreenshot}
                alt="Screenshot"
                className="w-full h-auto rounded-lg"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export { ProgressTracker };