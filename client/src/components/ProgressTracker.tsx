import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';

interface ProgressUpdate {
  taskId: number;
  step: number;
  totalSteps: number;
  status: 'started' | 'processing' | 'completed' | 'failed';
  message: string;
  timestamp: Date;
  screenshot?: string;
  data?: any;
}

interface ProgressTrackerProps {
  userId: string;
  taskId?: number;
  onComplete?: (data: any) => void;
  onError?: (error: any) => void;
}

export function ProgressTracker({ userId, taskId, onComplete, onError }: ProgressTrackerProps) {
  const [updates, setUpdates] = useState<ProgressUpdate[]>([]);
  const [currentUpdate, setCurrentUpdate] = useState<ProgressUpdate | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    // Connect to WebSocket for real-time updates
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/progress?userId=${userId}`;
    
    const websocket = new WebSocket(wsUrl);
    
    websocket.onopen = () => {
      console.log('Progress WebSocket connected');
      setWs(websocket);
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      if (onError) {
        onError(error);
      }
    };

    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'progress') {
          const update: ProgressUpdate = {
            ...data,
            timestamp: new Date(data.timestamp)
          };
          
          setUpdates(prev => [...prev, update]);
          setCurrentUpdate(update);

          // Handle task completion
          if (update.status === 'completed' && onComplete) {
            onComplete(update.data);
          } else if (update.status === 'failed' && onError) {
            onError(update.data?.error);
          }
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    websocket.onerror = (error) => {
      console.error('Progress WebSocket error:', error);
    };

    websocket.onclose = () => {
      console.log('Progress WebSocket disconnected');
      setWs(null);
    };

    return () => {
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.close();
      }
    };
  }, [userId, onComplete, onError]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'started':
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'started':
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const calculateProgress = () => {
    if (!currentUpdate || currentUpdate.totalSteps <= 0) return 0;
    if (currentUpdate.status === 'completed') return 100;
    return Math.round((currentUpdate.step / currentUpdate.totalSteps) * 100);
  };

  if (!currentUpdate) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Waiting for task to start...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current Progress */}
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon(currentUpdate.status)}
              Task Progress
            </div>
            <Badge className={getStatusColor(currentUpdate.status)}>
              {currentUpdate.status.toUpperCase()}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Step {currentUpdate.step} of {currentUpdate.totalSteps}</span>
              <span>{calculateProgress()}%</span>
            </div>
            <Progress value={calculateProgress()} className="w-full" />
          </div>
          
          <div className="text-sm text-gray-600">
            {currentUpdate.message}
          </div>

          {currentUpdate.screenshot && (
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2">Current Screen</h4>
              <img 
                src={`data:image/png;base64,${currentUpdate.screenshot}`}
                alt="Current automation step"
                className="w-full max-w-md rounded-lg border shadow-sm"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step History */}
      {updates.length > 1 && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Step History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {updates.slice(-5).map((update, index) => (
                <div key={index} className="flex items-center gap-3 text-sm p-2 rounded bg-gray-50">
                  {getStatusIcon(update.status)}
                  <div className="flex-1">
                    <div className="font-medium">{update.message}</div>
                    <div className="text-xs text-gray-500">
                      {update.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}