/**
 * Autonomous Agent Demo Component
 * 
 * Demonstrates how to use the Autonomous Invoice Processing Agent
 * with file upload, progress tracking, and result display.
 */

import React, { useState } from 'react';
import { useAutonomousAgent } from '../hooks/useAutonomousAgent';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Upload, Bot, Settings, BarChart3, CheckCircle, XCircle, Clock, Activity } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  disabled: boolean;
}

function FileUpload({ onFileSelect, disabled }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        dragActive
          ? 'border-primary bg-primary/5'
          : 'border-gray-300 hover:border-gray-400'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => !disabled && document.getElementById('file-input')?.click()}
    >
      <input
        id="file-input"
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.xml,.json"
        onChange={handleFileInput}
        className="hidden"
        disabled={disabled}
      />
      <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
      <p className="text-lg font-medium text-gray-900 mb-2">
        Drop your invoice here or click to browse
      </p>
      <p className="text-sm text-gray-500">
        Supports PDF, images, XML, and JSON files
      </p>
    </div>
  );
}

function ProgressDisplay({ progress, isConnected }: { progress: any; isConnected: boolean }) {
  if (!progress) return null;

  const getStatusIcon = () => {
    if (progress.percentage === 100) return <CheckCircle className="h-5 w-5 text-green-500" />;
    if (progress.percentage > 0) return <Activity className="h-5 w-5 text-blue-500" />;
    return <Clock className="h-5 w-5 text-gray-500" />;
  };

  const getStatusColor = () => {
    if (progress.percentage === 100) return 'text-green-600';
    if (progress.percentage > 0) return 'text-blue-600';
    return 'text-gray-600';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {getStatusIcon()}
          Processing Progress
          <Badge variant={isConnected ? 'default' : 'secondary'}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Step {progress.currentStep} of {progress.totalSteps}</span>
            <span className={getStatusColor()}>{progress.percentage}%</span>
          </div>
          <Progress value={progress.percentage} className="h-2" />
        </div>
        
        <div className="space-y-1">
          <p className="font-medium">{progress.message}</p>
          {progress.stepDetails && (
            <p className="text-sm text-gray-600">{progress.stepDetails}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ResultsDisplay({ result }: { result: any }) {
  if (!result) return null;

  const getStatusIcon = () => {
    return result.success ? (
      <CheckCircle className="h-6 w-6 text-green-500" />
    ) : (
      <XCircle className="h-6 w-6 text-red-500" />
    );
  };

  const getStatusBadge = () => {
    const variant = result.success ? 'default' : 'destructive';
    return (
      <Badge variant={variant}>
        {result.success ? 'Success' : 'Failed'}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {getStatusIcon()}
          Processing Results
          {getStatusBadge()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium text-gray-500">Final Status</p>
            <p className="text-lg font-semibold">{result.final_status}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Processing Time</p>
            <p className="text-lg font-semibold">
              {(result.processing_time_ms / 1000).toFixed(2)}s
            </p>
          </div>
        </div>

        {result.metrics && (
          <div className="space-y-2">
            <p className="font-medium">Metrics</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {result.metrics.classification_confidence && (
                <div className="flex justify-between">
                  <span>Confidence:</span>
                  <span>{(result.metrics.classification_confidence * 100).toFixed(1)}%</span>
                </div>
              )}
              {result.metrics.validation_score && (
                <div className="flex justify-between">
                  <span>Validation:</span>
                  <span>{(result.metrics.validation_score * 100).toFixed(1)}%</span>
                </div>
              )}
              {result.metrics.match_accuracy && (
                <div className="flex justify-between">
                  <span>Match Accuracy:</span>
                  <span>{(result.metrics.match_accuracy * 100).toFixed(1)}%</span>
                </div>
              )}
            </div>
          </div>
        )}

        {result.error && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function ConfigurationPanel({ config, agentInfo }: { config: any; agentInfo: any }) {
  if (!config || !agentInfo) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Agent Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="font-medium">{agentInfo.name}</p>
          <p className="text-sm text-gray-500">Version {agentInfo.version}</p>
        </div>

        <div>
          <p className="font-medium mb-2">Capabilities</p>
          <div className="flex flex-wrap gap-1">
            {agentInfo.capabilities.map((capability: string) => (
              <Badge key={capability} variant="outline" className="text-xs">
                {capability.replace('_', ' ')}
              </Badge>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium text-gray-500">Classification Method</p>
            <p>{config.classification_method}</p>
          </div>
          <div>
            <p className="font-medium text-gray-500">Max Retries</p>
            <p>{config.max_retries}</p>
          </div>
          <div>
            <p className="font-medium text-gray-500">Auto Approve Threshold</p>
            <p>{(config.auto_approve_threshold * 100).toFixed(0)}%</p>
          </div>
          <div>
            <p className="font-medium text-gray-500">WebSocket Progress</p>
            <p>{config.use_websocket_progress ? 'Enabled' : 'Disabled'}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AutonomousAgentDemo() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const {
    agentConfig,
    agentInfo,
    configLoading,
    processInvoiceAsync,
    isProcessing,
    processingError,
    processingResult,
    progress,
    isConnected,
    reset,
  } = useAutonomousAgent();

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
  };

  const handleProcess = async () => {
    if (!selectedFile) return;

    try {
      await processInvoiceAsync({
        file: selectedFile,
        fileName: selectedFile.name,
        config: {
          classification_method: 'ai',
          auto_approve_threshold: 0.95,
        },
        additionalContext: {
          source: 'demo-ui',
          priority: 'normal',
        },
      });
    } catch (error) {
      console.error('Processing failed:', error);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    reset();
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Bot className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Autonomous Invoice Processing Agent</h1>
        </div>
        <p className="text-gray-600">
          Intelligent end-to-end invoice processing with real-time progress tracking
        </p>
      </div>

      <Tabs defaultValue="upload" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="progress" disabled={!progress && !isProcessing}>
            Progress
          </TabsTrigger>
          <TabsTrigger value="results" disabled={!processingResult}>
            Results
          </TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Upload Invoice</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FileUpload
                onFileSelect={handleFileSelect}
                disabled={isProcessing}
              />
              
              {selectedFile && (
                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-gray-500">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button
                    onClick={handleProcess}
                    disabled={isProcessing}
                    className="flex items-center gap-2"
                  >
                    <Bot className="h-4 w-4" />
                    {isProcessing ? 'Processing...' : 'Process with Agent'}
                  </Button>
                </div>
              )}

              {processingError && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>
                    Processing failed: {processingError.message}
                  </AlertDescription>
                </Alert>
              )}

              {(processingResult || processingError) && (
                <Button onClick={handleReset} variant="outline" className="w-full">
                  Reset and Try Again
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="progress">
          <ProgressDisplay progress={progress} isConnected={isConnected} />
        </TabsContent>

        <TabsContent value="results">
          <ResultsDisplay result={processingResult?.result} />
        </TabsContent>

        <TabsContent value="config">
          {configLoading ? (
            <Card>
              <CardContent className="p-6 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p>Loading agent configuration...</p>
              </CardContent>
            </Card>
          ) : (
            <ConfigurationPanel config={agentConfig} agentInfo={agentInfo} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
