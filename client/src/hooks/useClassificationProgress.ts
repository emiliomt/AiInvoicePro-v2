
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface ClassificationProgress {
  invoiceId: number;
  processed: number;
  total: number;
  percentage: number;
  currentItem?: string;
}

interface ClassificationUpdate {
  lineItemId: number;
  invoiceId: number;
  category: string;
  confidence: number;
}

export function useClassificationProgress() {
  const [progress, setProgress] = useState<ClassificationProgress | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('Classification WebSocket connected');
      // Subscribe to classification updates
      ws.send(JSON.stringify({
        type: 'subscribe',
        userId: 'current-user' // Replace with actual user ID
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'classification_progress':
            setProgress(data);
            setIsProcessing(true);
            break;
            
          case 'classification_complete':
            setProgress(null);
            setIsProcessing(false);
            // Invalidate queries to refresh data
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['invoice', data.invoiceId] });
            break;
            
          case 'line_item_classified':
            // Update specific line item in cache
            handleLineItemUpdate(data);
            break;
            
          case 'classification_error':
            setProgress(null);
            setIsProcessing(false);
            console.error('Classification error:', data.error);
            break;
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('Classification WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('Classification WebSocket disconnected');
    };

    return () => {
      ws.close();
    };
  }, [queryClient]);

  const handleLineItemUpdate = (update: ClassificationUpdate) => {
    // Update the invoice cache with new classification
    queryClient.setQueryData(['invoices'], (oldData: any) => {
      if (!oldData) return oldData;
      
      return oldData.map((invoice: any) => {
        if (invoice.id === update.invoiceId) {
          return {
            ...invoice,
            lineItems: invoice.lineItems?.map((item: any) => 
              item.id === update.lineItemId 
                ? { ...item, classification: update.category, confidence: update.confidence }
                : item
            )
          };
        }
        return invoice;
      });
    });

    // Also update individual invoice cache if it exists
    queryClient.setQueryData(['invoice', update.invoiceId], (oldData: any) => {
      if (!oldData) return oldData;
      
      return {
        ...oldData,
        lineItems: oldData.lineItems?.map((item: any) => 
          item.id === update.lineItemId 
            ? { ...item, classification: update.category, confidence: update.confidence }
            : item
        )
      };
    });
  };

  return {
    progress,
    isProcessing
  };
}
