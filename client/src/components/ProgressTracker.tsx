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
}

export default function ProgressTracker({ isOpen, onClose, configId, configName }: ProgressTrackerProps) {
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    if (isOpen && configId) {
      startPolling();
    } else {
      stopPolling();
    }

    return () => stopPolling();
  }, [isOpen, configId]);

  const startPolling = () => {
    setIsPolling(true);
    pollProgress();
  };

  const stopPolling = () => {
    setIsPolling(false);
  };

  const pollProgress = async () => {
    if (!isPolling) return;

    try {
      const response = await fetch(`/api/invoice-importer/progress/${configId}`);
      if (response.ok) {
        const data = await response.json();
        setProgress(data);
        
        // Continue polling if task is still running
        if (data.status === 'running' || data.status === 'pending') {
          setTimeout(pollProgress, 2000); // Poll every 2 seconds
        } else {
          setIsPolling(false);
        }
      }
    } catch (error) {
      console.error('Error polling progress:', error);
      setTimeout(pollProgress, 5000); // Retry after 5 seconds on error
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

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Import Progress - {configName}</DialogTitle>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
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
                  <CardTitle className="text-lg">Step-by-Step Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
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