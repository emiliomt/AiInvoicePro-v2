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
  taskName: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentStep?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  steps: ProgressStep[];
  logs: ProgressLog[];
  stats: ProgressStats;
  result?: any;
  error?: string;
}

export interface ProgressTrackerProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
  taskName?: string;
  useWebSocket?: boolean;
  pollingInterval?: number;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
  className?: string;
}

export default function ProgressTracker({
  isOpen,
  onClose,
  taskId,
  taskName = "Processing Task",
  useWebSocket = true,
  pollingInterval = 2000,
  onComplete,
  onError,
  className
}: ProgressTrackerProps) {
  const [progressData, setProgressData] = useState<ProgressData | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [isExpanded, setIsExpanded] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [wsEnabled, setWsEnabled] = useState(useWebSocket);

  const wsRef = useRef<WebSocket | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // WebSocket connection
  const connectWebSocket = useCallback(() => {
    if (!taskId || wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      setConnectionStatus('connecting');
      const wsUrl = `ws://${window.location.host}/ws?userId=${encodeURIComponent('current-user')}`;
      
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('📡 WebSocket connected for progress tracking');
        setConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;
        
        // Subscribe to task updates
        if (wsRef.current) {
          wsRef.current.send(JSON.stringify({
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
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      wsRef.current.onclose = () => {
        console.log('📡 WebSocket disconnected');
        setConnectionStatus('disconnected');
        
        // Auto-reconnect with exponential backoff
        if (reconnectAttemptsRef.current < 5 && isOpen) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connectWebSocket();
          }, delay);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('error');
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionStatus('error');
      // Fallback to HTTP polling
      setWsEnabled(false);
      startHttpPolling();
    }
  }, [taskId, isOpen]);

  // HTTP polling fallback
  const startHttpPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;

    const poll = async () => {
      try {
        const response = await fetch(`/api/progress/${taskId}`);
        if (response.ok) {
          const data = await response.json();
          setProgressData(data);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    };

    poll(); // Initial fetch
    pollingIntervalRef.current = setInterval(poll, pollingInterval);
  }, [taskId, pollingInterval]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // Auto-scroll to bottom of logs
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [progressData?.logs, autoScroll]);

  // WebSocket message handler
  const handleWebSocketMessage = useCallback((message: any) => {
    if (message.taskId !== taskId) return;

    switch (message.type) {
      case 'progress':
        setProgressData(message.data);
        break;

      case 'step_update':
        setProgressData(prev => prev ? {
          ...prev,
          steps: message.data.allSteps || prev.steps
        } : null);
        break;

      case 'log':
        setProgressData(prev => prev ? {
          ...prev,
          logs: [...prev.logs, {
            timestamp: Date.now(),
            level: message.data.level || 'info',
            message: message.data.message
          }]
        } : null);
        break;

      case 'stats':
        setProgressData(prev => prev ? {
          ...prev,
          stats: { ...prev.stats, ...message.data }
        } : null);
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
  }, [taskId, onComplete, onError]);

  // Connection management
  useEffect(() => {
    if (isOpen) {
      if (wsEnabled) {
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
  }, [isOpen, connectWebSocket, startHttpPolling, stopPolling, wsEnabled]);

  // Retry connection
  const retryConnection = () => {
    setWsEnabled(true);
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

  // Get connection status indicator
  const getConnectionIndicator = () => {
    switch (connectionStatus) {
      case 'connected':
        return <Wifi className="w-4 h-4 text-green-500" />;
      case 'connecting':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'error':
        return <WifiOff className="w-4 h-4 text-red-500" />;
      default:
        return <WifiOff className="w-4 h-4 text-gray-400" />;
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={cn("max-w-4xl max-h-[90vh] flex flex-col", className)}>
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              {progressData ? getStatusIcon(progressData.status) : <Clock className="w-4 h-4" />}
              {progressData?.taskName || taskName}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {getConnectionIndicator()}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col space-y-4">
          {/* Progress Overview */}
          {progressData && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant={progressData.status === 'completed' ? 'default' : 
                               progressData.status === 'failed' ? 'destructive' : 'secondary'}>
                  {progressData.status.charAt(0).toUpperCase() + progressData.status.slice(1)}
                </Badge>
                <span className="text-sm text-gray-500">
                  {progressData.progress}% Complete
                </span>
              </div>
              
              <Progress value={progressData.progress} className="h-2" />
              
              {progressData.currentStep && (
                <p className="text-sm text-gray-600">{progressData.currentStep}</p>
              )}

              {/* Statistics */}
              <div className="grid grid-cols-4 gap-4 text-center text-sm">
                <div>
                  <div className="font-medium">{progressData.stats.processed}</div>
                  <div className="text-gray-500">Processed</div>
                </div>
                <div>
                  <div className="font-medium text-green-600">{progressData.stats.successful}</div>
                  <div className="text-gray-500">Success</div>
                </div>
                <div>
                  <div className="font-medium text-red-600">{progressData.stats.failed}</div>
                  <div className="text-gray-500">Failed</div>
                </div>
                <div>
                  <div className="font-medium text-yellow-600">{progressData.stats.errors}</div>
                  <div className="text-gray-500">Errors</div>
                </div>
              </div>
            </div>
          )}

          {isExpanded && progressData && (
            <>
              <Separator />
              
              {/* Steps */}
              {progressData.steps.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Processing Steps</h4>
                  <ScrollArea className="h-32">
                    <div className="space-y-2">
                      {progressData.steps.map((step) => (
                        <div key={step.id} className="flex items-center gap-2 text-sm">
                          {getStatusIcon(step.status)}
                          <span className={cn(
                            step.status === 'completed' ? 'text-green-700' :
                            step.status === 'failed' ? 'text-red-700' :
                            step.status === 'running' ? 'text-blue-700' : 'text-gray-500'
                          )}>
                            {step.name}
                          </span>
                          {step.duration && (
                            <span className="text-gray-400 ml-auto">
                              {formatDuration(step.duration)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Logs */}
              {progressData.logs.length > 0 && (
                <div className="space-y-2 flex-1 flex flex-col min-h-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Logs</h4>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAutoScroll(!autoScroll)}
                        className="text-xs"
                      >
                        Auto-scroll: {autoScroll ? 'On' : 'Off'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearLogs}
                        className="text-xs"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <ScrollArea className="flex-1 min-h-0 max-h-48 bg-gray-50 rounded p-2">
                    <div className="space-y-1 text-xs font-mono">
                      {progressData.logs.map((log, index) => (
                        <div
                          key={index}
                          className={cn(
                            "flex gap-2",
                            log.level === 'error' && 'text-red-600',
                            log.level === 'warning' && 'text-yellow-600',
                            log.level === 'success' && 'text-green-600',
                            log.level === 'info' && 'text-gray-700'
                          )}
                        >
                          <span className="text-gray-400 flex-shrink-0">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                          <span>{log.message}</span>
                        </div>
                      ))}
                      <div ref={logsEndRef} />
                    </div>
                  </ScrollArea>
                </div>
              )}
            </>
          )}

          {/* Connection Status */}
          {connectionStatus !== 'connected' && wsEnabled && (
            <div className="flex items-center justify-between p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
              <span>Connection {connectionStatus}</span>
              <Button variant="outline" size="sm" onClick={retryConnection}>
                <RotateCcw className="w-3 h-3 mr-1" />
                Retry
              </Button>
            </div>
          )}

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