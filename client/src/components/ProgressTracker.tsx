import React, { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, Clock, Terminal, WifiOff, Wifi } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ProgressStats {
  total_invoices: number;
  processed_invoices: number;
  successful_imports: number;
  failed_imports: number;
}

interface ProgressUpdate {
  type: 'progress';
  taskId: number;
  step: number;
  totalSteps: number;
  status: 'running' | 'completed' | 'failed' | 'idle';
  message: string;
  data?: ProgressStats;
  timestamp?: string;
}

interface ProgressTrackerProps {
  taskId: number;
  status: 'running' | 'completed' | 'failed' | 'idle';
  progress?: number;
  currentStep?: string;
  stats?: ProgressStats;
  onProgressUpdate?: (update: ProgressUpdate) => void;
}

const WORKFLOW_STEPS = [
  { id: 1, description: "Initializing browser session", progressRange: [0, 5] },
  { id: 2, description: "Navigating to ERP login page", progressRange: [5, 15] },
  { id: 3, description: "Logging into ERP system", progressRange: [15, 25] },
  { id: 4, description: "Navigating to invoice section", progressRange: [25, 35] },
  { id: 5, description: "Loading invoice list", progressRange: [35, 45] },
  { id: 6, description: "Scanning available invoices", progressRange: [45, 55] },
  { id: 7, description: "Processing invoice downloads", progressRange: [55, 70] },
  { id: 8, description: "Extracting XML files", progressRange: [70, 80] },
  { id: 9, description: "Extracting PDF files", progressRange: [80, 90] },
  { id: 10, description: "Processing invoice metadata", progressRange: [90, 95] },
  { id: 11, description: "Storing imported invoices", progressRange: [95, 98] },
  { id: 12, description: "Cleaning up and finalizing", progressRange: [98, 100] }
];

export function ProgressTracker({ 
  taskId, 
  status, 
  progress = 0, 
  currentStep = 'Initializing...', 
  stats,
  onProgressUpdate 
}: ProgressTrackerProps) {
  const [wsConnected, setWsConnected] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showConsole, setShowConsole] = useState(false);

  // WebSocket connection for real-time updates
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    const connectWebSocket = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('WebSocket connected');
          setWsConnected(true);
          reconnectAttempts = 0;
          
          // Subscribe to progress updates for this task
          ws?.send(JSON.stringify({
            type: 'subscribe',
            taskId: taskId.toString()
          }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'progress' && data.taskId === taskId) {
              onProgressUpdate?.(data);
            }
            
            if (data.type === 'log' && data.taskId === taskId) {
              setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${data.message}`]);
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
          setWsConnected(false);
          
          // Attempt to reconnect with exponential backoff
          if (reconnectAttempts < maxReconnectAttempts) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
            setTimeout(() => {
              reconnectAttempts++;
              connectWebSocket();
            }, delay);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setWsConnected(false);
        };

      } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        setWsConnected(false);
      }
    };

    if (status === 'running') {
      connectWebSocket();
    }

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [taskId, status, onProgressUpdate]);

  // Fallback polling when WebSocket is not available
  useEffect(() => {
    if (!wsConnected && status === 'running') {
      const pollInterval = setInterval(async () => {
        try {
          const response = await fetch(`/api/rpa/progress/${taskId}`);
          if (response.ok) {
            const data = await response.json();
            onProgressUpdate?.(data);
          }
        } catch (error) {
          console.error('Error polling for progress:', error);
        }
      }, 1500);

      return () => clearInterval(pollInterval);
    }
  }, [wsConnected, status, taskId, onProgressUpdate]);

  const getStatusIcon = () => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4" />;
      case 'failed':
        return <XCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getStatusVariant = () => {
    switch (status) {
      case 'running':
        return 'secondary' as const;
      case 'completed':
        return 'default' as const;
      case 'failed':
        return 'destructive' as const;
      default:
        return 'outline' as const;
    }
  };

  const getCurrentStepInfo = () => {
    const currentStepIndex = Math.floor((progress / 100) * WORKFLOW_STEPS.length);
    return WORKFLOW_STEPS[Math.min(currentStepIndex, WORKFLOW_STEPS.length - 1)];
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="space-y-3">
      {/* Connection Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={getStatusVariant()} className="flex items-center gap-1">
            {getStatusIcon()}
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
          
          {status === 'running' && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {wsConnected ? (
                <>
                  <Wifi className="h-3 w-3 text-green-500" />
                  <span>Live</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 text-yellow-500" />
                  <span>Polling</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Console Toggle */}
        <Dialog open={showConsole} onOpenChange={setShowConsole}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="flex items-center gap-1">
              <Terminal className="h-3 w-3" />
              Console
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[80vh]">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>Processing Console - Task {taskId}</DialogTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAutoScroll(!autoScroll)}
                  >
                    Auto-scroll: {autoScroll ? 'On' : 'Off'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={clearLogs}>
                    Clear
                  </Button>
                </div>
              </div>
            </DialogHeader>
            <ScrollArea className="h-[60vh] w-full border rounded-md p-4">
              <div className="space-y-1 font-mono text-sm">
                {logs.length === 0 ? (
                  <div className="text-muted-foreground">No logs yet...</div>
                ) : (
                  logs.map((log, index) => (
                    <div
                      key={index}
                      className={`
                        ${log.includes('ERROR') ? 'text-red-500' : ''}
                        ${log.includes('WARNING') ? 'text-yellow-500' : ''}
                        ${log.includes('SUCCESS') || log.includes('COMPLETED') ? 'text-green-500' : ''}
                      `}
                    >
                      {log}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>

      {/* Progress Section */}
      {status === 'running' && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              {currentStep || getCurrentStepInfo()?.description || 'Processing...'}
            </p>
            <p className="text-sm text-muted-foreground">
              {Math.round(progress)}%
            </p>
          </div>
          
          <Progress value={progress} className="w-full" />
          
          {/* Step Indicator */}
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Step {Math.min(Math.floor((progress / 100) * 12) + 1, 12)} of 12</span>
            <span>{progress >= 100 ? 'Complete' : 'In Progress'}</span>
          </div>
        </div>
      )}

      {/* Statistics Grid */}
      {stats && (
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="text-center p-2 bg-muted rounded">
            <div className="font-semibold">{stats.total_invoices || 0}</div>
            <div className="text-muted-foreground">Total</div>
          </div>
          <div className="text-center p-2 bg-muted rounded">
            <div className="font-semibold">{stats.processed_invoices || 0}</div>
            <div className="text-muted-foreground">Processed</div>
          </div>
          <div className="text-center p-2 bg-green-50 rounded">
            <div className="font-semibold text-green-700">{stats.successful_imports || 0}</div>
            <div className="text-green-600">Success</div>
          </div>
          <div className="text-center p-2 bg-red-50 rounded">
            <div className="font-semibold text-red-700">{stats.failed_imports || 0}</div>
            <div className="text-red-600">Failed</div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {status === 'failed' && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">
            Processing failed. Check the console for detailed error information.
          </p>
        </div>
      )}

      {/* Success Display */}
      {status === 'completed' && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm text-green-800">
            Processing completed successfully!
            {stats && ` Processed ${stats.processed_invoices} invoices with ${stats.successful_imports} successful imports.`}
          </p>
        </div>
      )}
    </div>
  );
}

export default ProgressTracker;