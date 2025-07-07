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

  const getERPLogo = (message: string) => {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('sinco')) {
      return (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
            S
          </div>
          <span className="font-medium text-blue-700">SINCO ERP</span>
        </div>
      );
    } else if (lowerMessage.includes('sap')) {
      return (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center text-white text-xs font-bold">
            SAP
          </div>
          <span className="font-medium text-blue-700">SAP</span>
        </div>
      );
    } else if (lowerMessage.includes('oracle')) {
      return (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-white text-xs font-bold">
            O
          </div>
          <span className="font-medium text-red-700">Oracle</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center text-white text-xs font-bold">
          ERP
        </div>
        <span className="font-medium text-gray-700">ERP System</span>
      </div>
    );
  };

  return (
    <Card className="shadow-sm border-l-4 border-l-blue-500">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getERPLogo(progress.message)}
            <span>Import Progress</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              connectionStatus === 'connected' ? 'bg-green-500 animate-pulse' : 
              connectionStatus === 'connecting' ? 'bg-yellow-500 animate-bounce' : 
              'bg-red-500'
            }`} title={`WebSocket ${connectionStatus}`} />
            {getStatusBadge()}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Main Progress Section */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex justify-between text-sm mb-2">
              <span className="font-medium text-gray-700">{progress.message}</span>
              <span className="font-mono text-blue-600">{progress.step}/{progress.totalSteps}</span>
            </div>
            <div className="relative">
              <Progress value={progressPercentage} className="h-3" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-medium text-white mix-blend-difference">
                  {Math.round(progressPercentage)}%
                </span>
              </div>
            </div>
          </div>

          {/* Status Icon and Details */}
          <div className="flex items-center gap-3 p-3 bg-white border rounded-lg">
            {getStatusIcon()}
            <div className="flex-1">
              <div className="font-medium text-sm">
                {progress.status === 'processing' && 'Processing invoices...'}
                {progress.status === 'completed' && 'Import completed successfully!'}
                {progress.status === 'failed' && 'Import failed'}
              </div>
              <div className="text-xs text-gray-500">
                Started: {progress.timestamp.toLocaleString()}
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-blue-600">
                {Math.round(progressPercentage)}%
              </div>
              <div className="text-xs text-gray-500">Complete</div>
            </div>
          </div>

          {/* Connection Status */}
          {connectionStatus !== 'connected' && (
            <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-orange-600" />
              <span className="text-sm text-orange-700">
                Connection: {connectionStatus}
              </span>
            </div>
          )}

          {/* Import Statistics */}
          {progress.data && (
            <div className="grid grid-cols-2 gap-3">
              {progress.data.processedInvoices !== undefined && (
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                  <div className="text-lg font-bold text-blue-700">
                    {progress.data.processedInvoices}
                  </div>
                  <div className="text-xs text-blue-600">Invoices Processed</div>
                </div>
              )}
              {progress.data.successfulImports !== undefined && (
                <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                  <div className="text-lg font-bold text-green-700">
                    {progress.data.successfulImports}
                  </div>
                  <div className="text-xs text-green-600">Successful Imports</div>
                </div>
              )}
              {progress.data.failedImports !== undefined && progress.data.failedImports > 0 && (
                <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                  <div className="text-lg font-bold text-red-700">
                    {progress.data.failedImports}
                  </div>
                  <div className="text-xs text-red-600">Failed Imports</div>
                </div>
              )}
              {progress.data.totalInvoices !== undefined && (
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <div className="text-lg font-bold text-gray-700">
                    {progress.data.totalInvoices}
                  </div>
                  <div className="text-xs text-gray-600">Total Invoices</div>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}