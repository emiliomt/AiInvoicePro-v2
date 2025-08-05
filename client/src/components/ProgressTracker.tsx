
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle, 
  Loader2, 
  Wifi, 
  WifiOff,
  Maximize2,
  Minimize2,
  Trash2,
  RotateCcw
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProgressStep {
  id: number;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: number;
  endTime?: number;
  duration?: number;
  details?: string;
}

export interface ProgressStats {
  processed: number;
  successful: number;
  failed: number;
  errors: number;
}

export interface ProgressLog {
  timestamp: number;
  level: 'info' | 'warning' | 'error' | 'success' | 'debug';
  message: string;
  details?: any;
}

export interface ProgressData {
  taskId: string;
  configId?: number;
  jobId?: string;
  userId: string;
  type: 'invoice_import' | 'rpa_automation' | 'comprehensive_workflow';
  status: 'starting' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
  stats?: ProgressStats;
  currentStep?: ProgressStep;
  steps?: ProgressStep[];
  logs?: ProgressLog[];
  startTime?: number;
  endTime?: number;
  totalDuration?: number;
  error?: string;
  result?: any;
}

interface ProgressTrackerProps {
  isOpen: boolean;
  onClose: () => void;
  taskId?: string;
  configId?: number;
  jobId?: string;
  userId: string;
  title?: string;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

export default function ProgressTracker({
  isOpen,
  onClose,
  taskId,
  configId,
  jobId,
  userId,
  title = "Processing Progress",
  onComplete,
  onError
}: ProgressTrackerProps) {
  const [progressData, setProgressData] = useState<ProgressData | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [isExpanded, setIsExpanded] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [useWebSocket, setUseWebSocket] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const logsContainerRef = useRef<HTMLDivElement | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [progressData?.logs, autoScroll]);

  // WebSocket connection
  const connectWebSocket = useCallback(() => {
    if (!isOpen || !userId || !useWebSocket) return;

    try {
      setConnectionStatus('connecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws?userId=${encodeURIComponent(userId)}`;
      
      console.log('Connecting to WebSocket:', wsUrl);
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;

        // Subscribe to task updates
        if (taskId) {
          wsRef.current?.send(JSON.stringify({
            type: 'subscribe',
            taskId: taskId
          }));
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleWebSocketMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setConnectionStatus('disconnected');
        
        // Attempt reconnection if needed
        if (isOpen && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
          console.log(`Attempting WebSocket reconnection in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, delay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          console.log('Max WebSocket reconnection attempts reached, falling back to HTTP polling');
          setUseWebSocket(false);
          startHttpPolling();
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('error');
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionStatus('error');
      setUseWebSocket(false);
      startHttpPolling();
    }
  }, [isOpen, userId, taskId, useWebSocket]);

  // HTTP polling fallback
  const startHttpPolling = useCallback(() => {
    if (!isOpen || useWebSocket) return;

    console.log('Starting HTTP polling for progress updates');
    setConnectionStatus('connected');

    const poll = async () => {
      try {
        let url = '';
        if (configId) {
          url = `/api/invoice-importer/progress/${configId}`;
        } else if (jobId) {
          url = `/api/rpa/progress/${jobId}`;
        } else if (taskId) {
          url = `/api/progress/${taskId}`;
        } else {
          return;
        }

        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.progress) {
            setProgressData(data.progress);
            
            // Check if task is complete
            if (data.progress.status === 'completed' || data.progress.status === 'failed') {
              stopPolling();
              if (data.progress.status === 'completed' && onComplete) {
                onComplete(data.progress.result);
              } else if (data.progress.status === 'failed' && onError) {
                onError(data.progress.error || 'Task failed');
              }
            }
          }
        }
      } catch (error) {
        console.error('HTTP polling error:', error);
        setConnectionStatus('error');
      }
    };

    // Poll every 2 seconds
    pollingIntervalRef.current = setInterval(poll, 2000);
    
    // Initial poll
    poll();
  }, [isOpen, useWebSocket, configId, jobId, taskId, onComplete, onError]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'connection_status':
        if (message.data.status === 'connected') {
          setConnectionStatus('connected');
        }
        break;

      case 'progress':
        setProgressData(message.data);
        break;

      case 'log':
        setProgressData(prev => {
          if (!prev) return prev;
          const newLogs = [...(prev.logs || []), message.data];
          return { ...prev, logs: newLogs };
        });
        break;

      case 'step_update':
        setProgressData(prev => {
          if (!prev) return prev;
          const updatedSteps = prev.steps?.map(step => 
            step.id === message.data.id ? { ...step, ...message.data } : step
          ) || [];
          return { ...prev, steps: updatedSteps, currentStep: message.data };
        });
        break;

      case 'stats':
        setProgressData(prev => {
          if (!prev) return prev;
          return { ...prev, stats: message.data };
        });
        break;

      case 'task_complete':
        setProgressData(message.data);
        if (message.data.status === 'completed' && onComplete) {
          onComplete(message.data.result);
        } else if (message.data.status === 'failed' && onError) {
          onError(message.data.error || 'Task failed');
        }
        break;

      case 'task_cancelled':
      case 'task_timeout':
        setProgressData(message.data);
        if (onError) {
          onError(message.data.error || 'Task was cancelled');
        }
        break;
    }
  }, [onComplete, onError]);

  // Connection management
  useEffect(() => {
    if (isOpen) {
      if (useWebSocket) {
        connectWebSocket();
      } else {
        startHttpPolling();
      }
    }

    return () => {
      // Cleanup on unmount or when modal closes
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      stopPolling();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      setConnectionStatus('disconnected');
    };
  }, [isOpen, connectWebSocket, startHttpPolling, stopPolling, useWebSocket]);

  // Retry connection
  const retryConnection = () => {
    setUseWebSocket(true);
    reconnectAttemptsRef.current = 0;
    connectWebSocket();
  };

  // Clear logs
  const clearLogs = () => {
    setProgressData(prev => prev ? { ...prev, logs: [] } : null);
  };

  // Format duration
  const formatDuration = (ms: number): string => {
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

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-gray-400" />;
      default:
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    }
  };

  // Get log level color
  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-500';
      case 'warning':
        return 'text-yellow-500';
      case 'success':
        return 'text-green-500';
      case 'info':
        return 'text-blue-500';
      case 'debug':
        return 'text-gray-500';
      default:
        return 'text-gray-700';
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={cn(
        "max-w-4xl max-h-[90vh] overflow-hidden",
        isExpanded ? "w-[95vw] h-[90vh]" : "w-auto h-auto"
      )}>
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2">
            {title}
            <div className="flex items-center gap-2 ml-4">
              {connectionStatus === 'connected' ? (
                <Wifi className="w-4 h-4 text-green-500" />
              ) : connectionStatus === 'connecting' ? (
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-500" />
              )}
              <Badge variant={connectionStatus === 'connected' ? 'default' : 'destructive'}>
                {connectionStatus}
              </Badge>
            </div>
          </DialogTitle>
          <div className="flex items-center gap-2">
            {connectionStatus !== 'connected' && (
              <Button
                variant="outline"
                size="sm"
                onClick={retryConnection}
                className="flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                Retry
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Overall Progress */}
          {progressData && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  Overall Progress ({progressData.progress.current}/{progressData.progress.total})
                </span>
                <span className="text-sm text-gray-500">
                  {progressData.progress.percentage}%
                </span>
              </div>
              <Progress value={progressData.progress.percentage} className="w-full" />
              
              {/* Status and Stats */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getStatusIcon(progressData.status)}
                  <Badge variant={progressData.status === 'completed' ? 'default' : 
                                progressData.status === 'failed' ? 'destructive' : 'secondary'}>
                    {progressData.status}
                  </Badge>
                  {progressData.totalDuration && (
                    <span className="text-xs text-gray-500">
                      {formatDuration(progressData.totalDuration)}
                    </span>
                  )}
                </div>
                
                {progressData.stats && (
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-green-600">
                      ✓ {progressData.stats.successful}
                    </span>
                    <span className="text-red-600">
                      ✗ {progressData.stats.failed}
                    </span>
                    <span className="text-gray-600">
                      📊 {progressData.stats.processed}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Steps Progress */}
          {progressData?.steps && progressData.steps.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Steps</h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {progressData.steps.map((step) => (
                  <div key={step.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded text-xs">
                    {getStatusIcon(step.status)}
                    <span className={cn(
                      "flex-1",
                      step.status === 'completed' ? 'line-through text-gray-500' : ''
                    )}>
                      {step.name}
                    </span>
                    {step.duration && (
                      <span className="text-gray-500">
                        {formatDuration(step.duration)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Logs Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Logs</h4>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    className="rounded"
                  />
                  Auto-scroll
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearLogs}
                  className="flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear
                </Button>
              </div>
            </div>
            
            <ScrollArea className={cn(
              "border rounded p-2 bg-black text-green-400 font-mono text-xs",
              isExpanded ? "h-96" : "h-48"
            )}>
              <div ref={logsContainerRef} className="space-y-1">
                {progressData?.logs && progressData.logs.length > 0 ? (
                  progressData.logs.map((log, index) => (
                    <div key={index} className="flex gap-2">
                      <span className="text-gray-500 shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span className={cn(
                        "uppercase text-xs font-bold w-8 shrink-0",
                        getLogLevelColor(log.level)
                      )}>
                        {log.level}
                      </span>
                      <span className="flex-1 break-words">
                        {log.message}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-gray-500 text-center py-4">
                    {connectionStatus === 'connected' ? 'Waiting for logs...' : 'No connection to receive logs'}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Error Display */}
          {progressData?.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded">
              <h4 className="text-sm font-medium text-red-800 mb-1">Error</h4>
              <p className="text-sm text-red-700">{progressData.error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2">
            {progressData?.status === 'running' && (
              <Button
                variant="destructive"
                onClick={() => {
                  if (wsRef.current) {
                    wsRef.current.send(JSON.stringify({
                      type: 'cancel_task',
                      taskId: progressData.taskId
                    }));
                  }
                }}
              >
                Cancel
              </Button>
            )}
            <Button onClick={onClose}>
              {progressData?.status === 'running' ? 'Minimize' : 'Close'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
