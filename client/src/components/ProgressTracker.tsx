import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

interface ProgressUpdate {
  taskId: number;
  step: number;
  totalSteps: number;
  status: 'processing' | 'completed' | 'failed';
  message: string;
  timestamp: Date;
  data?: any;
}

interface ProgressTrackerProps {
  userId: string;
  taskId: number;
  onComplete?: () => void;
}

export function ProgressTracker({ userId, taskId, onComplete }: ProgressTrackerProps) {
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');

  useEffect(() => {
    let ws: WebSocket | null = null;
    let mounted = true;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    const connectWebSocket = () => {
      if (!mounted || reconnectAttempts >= maxReconnectAttempts) return;

      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        console.log(`Attempting WebSocket connection to: ${wsUrl}`);
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('WebSocket connected for progress tracking');
          setConnectionStatus('connected');
          reconnectAttempts = 0;

          // Subscribe to progress updates
          ws?.send(JSON.stringify({
            type: 'subscribe',
            userId: userId
          }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'progress' && data.taskId === taskId) {
              setProgress({
                ...data,
                timestamp: new Date(data.timestamp)
              });

              // Check if completed
              if (data.status === 'completed' || data.status === 'failed') {
                if (onComplete) {
                  onComplete();
                }
              }
            } else if (data.type === 'connected' || data.type === 'subscribed') {
              setConnectionStatus('connected');
            } else if (data.type === 'error') {
              console.error('WebSocket server error:', data.message);
              setConnectionStatus('error');
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
          setConnectionStatus('disconnected');

          // Attempt to reconnect after a delay
          if (mounted && reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            console.log(`Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`);
            setTimeout(connectWebSocket, 3000 * reconnectAttempts);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setConnectionStatus('error');
        };

      } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        setConnectionStatus('error');

        // Retry connection
        if (mounted && reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          setTimeout(connectWebSocket, 3000 * reconnectAttempts);
        }
      }
    };

    connectWebSocket();

    return () => {
      mounted = false;
      if (ws) {
        ws.close();
      }
    };
  }, [taskId, userId, onComplete]);

  if (!progress) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 animate-spin" />
            <span>Waiting for progress updates...</span>
            {connectionStatus !== 'connected' && (
              <Badge variant="outline" className="text-orange-600">
                {connectionStatus === 'connecting' ? 'Connecting...' : connectionStatus}
              </Badge>
            )}
            {connectionStatus === 'connected' && (
              <Badge variant="outline" className="text-green-600">
                Connected
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const progressPercentage = (progress.step / progress.totalSteps) * 100;

  const getStatusIcon = () => {
    switch (progress.status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'processing':
        return <Clock className="w-4 h-4 text-blue-600 animate-spin" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusBadge = () => {
    switch (progress.status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'processing':
        return <Badge className="bg-blue-100 text-blue-800">Processing</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Import Progress</span>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              connectionStatus === 'connected' ? 'bg-green-500' : 
              connectionStatus === 'connecting' ? 'bg-yellow-500' : 
              'bg-red-500'
            }`} title={`WebSocket ${connectionStatus}`} />
            <Badge variant={progress.status === 'completed' ? 'default' : progress.status === 'failed' ? 'destructive' : 'secondary'}>
              {progress.status}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>{progress.message}</span>
              <span>{progress.step}/{progress.totalSteps}</span>
            </div>
            <Progress value={(progress.step / progress.totalSteps) * 100} className="h-2" />
          </div>

          <div className="text-xs text-gray-500">
            Last updated: {progress.timestamp.toLocaleTimeString()}
          </div>

          {connectionStatus !== 'connected' && (
            <div className="text-xs text-orange-600 bg-orange-50 p-2 rounded">
              Connection status: {connectionStatus}
            </div>
          )}

          {progress.data && (
            <div className="text-xs bg-gray-50 p-2 rounded">
              <div className="grid grid-cols-2 gap-2">
                {progress.data.processedInvoices !== undefined && (
                  <div>Processed: {progress.data.processedInvoices}</div>
                )}
                {progress.data.successfulImports !== undefined && (
                  <div>Success: {progress.data.successfulImports}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}