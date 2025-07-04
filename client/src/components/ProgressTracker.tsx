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
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Use the current host and protocol to construct WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/ws`);

    ws.onopen = () => {
      setConnected(true);
      // Subscribe to progress updates for this user
      ws.send(JSON.stringify({
        type: 'subscribe',
        userId: userId
      }));
    };

    ws.onmessage = (event) => {
      try {
        // Check if the data is valid JSON before parsing
        if (!event.data || event.data.trim() === '') {
          console.warn('Received empty WebSocket message');
          return;
        }

        // Try to parse as JSON, but handle non-JSON messages gracefully
        let data;
        try {
          data = JSON.parse(event.data);
        } catch (parseError) {
          console.warn('Received non-JSON WebSocket message:', event.data);
          return;
        }

        if (data && data.taskId === taskId) {
          setProgress({
            ...data,
            timestamp: new Date(data.timestamp)
          });

          if (data.status === 'completed' || data.status === 'failed') {
            onComplete?.();
          }
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnected(false);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [userId, taskId, onComplete]);

  if (!progress) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 animate-spin" />
            <span>Waiting for progress updates...</span>
            {!connected && (
              <Badge variant="outline" className="text-orange-600">
                Connecting...
              </Badge>
            )}
            {connected && (
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
        <CardTitle className="text-sm flex items-center gap-2">
          {getStatusIcon()}
          Import Progress
          {getStatusBadge()}
        </CardTitle>
        <CardDescription>
          Step {progress.step} of {progress.totalSteps}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <Progress value={progressPercentage} className="w-full" />

          <div className="text-sm text-gray-600">
            {progress.message}
          </div>

          <div className="text-xs text-gray-500">
            Last updated: {progress.timestamp.toLocaleTimeString()}
          </div>

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