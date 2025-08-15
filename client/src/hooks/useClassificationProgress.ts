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

export const useClassificationProgress = () => {
  const [progress, setProgress] = useState<ClassificationProgress | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 Classification WebSocket message received:', data);

          switch (data.type) {
            case 'classification_progress':
              console.log('📊 Progress update:', data.data);
              setProgress(data.data);
              break;
            case 'line_item_classified':
              console.log('📋 Line item classified:', data.data);
              // Could update UI to show individual items being classified
              break;
            case 'classification_complete':
              console.log('✅ Classification complete for invoice:', data.data.invoiceId);
              // Keep progress visible for a moment before clearing
              setTimeout(() => {
                setProgress(null);
              }, 2000);
              break;
            case 'classification_error':
              console.error('❌ Classification error:', data.data.message);
              setError(data.data.message);
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

  return {
    progress,
    isConnected,
    error,
    connect,
    disconnect,
    clearProgress
  };
};