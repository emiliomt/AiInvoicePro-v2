import { useState, useEffect, useRef } from 'react';

interface ClassificationProgress {
  invoiceId: number;
  processed: number;
  total: number;
  percentage: number;
  currentItem?: string;
}

interface LineItemClassified {
  lineItemId: number;
  invoiceId: number;
  category: string;
  confidence: number;
}

interface ClassificationComplete {
  invoiceId: number;
}

interface ClassificationError {
  message: string;
  invoiceId?: number;
}

export const useClassificationProgress = (sessionId?: string) => {
  const [progress, setProgress] = useState<ClassificationProgress | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const subscribedSessionId = useRef<string | undefined>(sessionId);

  const connect = () => {
    try {
      // Clear any existing reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      console.log('🔌 Connecting to WebSocket for classification progress:', wsUrl);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ Classification WebSocket connected successfully');
        setIsConnected(true);
        setError(null);
        
        // Subscribe to progress updates for the specific session if provided
        if (subscribedSessionId.current) {
          console.log(`📡 Subscribing to progress session: ${subscribedSessionId.current}`);
          ws.send(JSON.stringify({
            type: 'subscribe_progress',
            sessionId: subscribedSessionId.current
          }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 Classification WebSocket message received:', data);

          switch (data.type) {
            case 'classification_progress':
              console.log('📊 Progress update:', data);
              // Extract progress data directly from the message
              setProgress({
                invoiceId: data.invoiceId,
                processed: data.processed,
                total: data.total,
                percentage: data.percentage,
                currentItem: data.currentItem
              });
              break;
            case 'progress_update':
              console.log('📊 ProgressTracker update:', data);
              // Handle ProgressTracker messages
              if (data.data) {
                setProgress({
                  invoiceId: data.data.currentInvoice || 0,
                  processed: data.data.processedItems || data.data.processedInvoices || 0,
                  total: data.data.totalItems || data.data.totalInvoices || 0,
                  percentage: data.data.percentage || 0,
                  currentItem: data.data.message || data.data.title || 'Processing...'
                });
              }
              break;
            case 'step_progress':
              console.log('📋 Step progress:', data);
              // Handle step-based progress updates
              if (data.data) {
                setProgress({
                  invoiceId: data.data.currentInvoice || 0,
                  processed: data.data.processedInvoices || 0,
                  total: data.data.totalInvoices || 0,
                  percentage: Math.round((data.data.currentStep / data.data.totalSteps) * 100),
                  currentItem: data.data.steps?.[data.data.currentStep]?.step || 'Processing...'
                });
              }
              break;
            case 'classification_started':
              console.log('🚀 Classification started:', data);
              // Initialize progress when classification starts
              if (data.data) {
                setProgress({
                  invoiceId: 0,
                  processed: 0,
                  total: data.data.totalInvoices || 0,
                  percentage: 0,
                  currentItem: 'Starting classification...'
                });
              }
              break;
            case 'classification_finished':
              console.log('✅ Classification finished:', data);
              // Keep progress visible for a moment before clearing
              setTimeout(() => {
                setProgress(null);
              }, 2000);
              break;
            case 'line_item_classified':
              console.log('📋 Line item classified:', data);
              // Could update UI to show individual items being classified
              break;
            case 'classification_complete':
              console.log('✅ Classification complete for invoice:', data.invoiceId);
              // Keep progress visible for a moment before clearing
              setTimeout(() => {
                setProgress(null);
              }, 2000);
              break;
            case 'classification_error':
              console.error('❌ Classification error:', data.error);
              setError(data.error || 'Classification error occurred');
              break;
            default:
              console.log('📨 Unknown classification message type:', data.type);
          }
        } catch (err) {
          console.error('❌ Error parsing classification WebSocket message:', err, 'Raw data:', event.data);
        }
      };

      ws.onclose = (event) => {
        console.log('🔌 Classification WebSocket closed:', event.code, event.reason);
        setIsConnected(false);
        wsRef.current = null;

        // Reconnect after a delay if it wasn't a manual close
        if (event.code !== 1000 && event.code !== 1001) {
          console.log('🔄 Scheduling WebSocket reconnection...');
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('🔄 Attempting to reconnect classification WebSocket...');
            connect();
          }, 3000);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ Classification WebSocket error:', error);
        setError('WebSocket connection failed');
        setIsConnected(false);
      };

    } catch (err) {
      console.error('❌ Error creating classification WebSocket connection:', err);
      setError('Failed to create WebSocket connection');
    }
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      console.log('🔌 Manually closing classification WebSocket connection');
      wsRef.current.close(1000, 'Manual disconnect');
    }
  };

  const clearProgress = () => {
    setProgress(null);
    setError(null);
  };

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, []);

  // Subscribe to new session when sessionId changes
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && sessionId) {
      subscribedSessionId.current = sessionId;
      console.log(`📡 Subscribing to new progress session: ${sessionId}`);
      wsRef.current.send(JSON.stringify({
        type: 'subscribe_progress',
        sessionId: sessionId
      }));
    }
  }, [sessionId]);

  return {
    progress,
    isConnected,
    error,
    connect,
    disconnect,
    clearProgress
  };
};