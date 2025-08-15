
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
      console.log('📡 Classification WebSocket connected');
      // Subscribe to classification updates with current user
      ws.send(JSON.stringify({
        type: 'subscribe',
        userId: '43658475' // Use actual user ID from your session
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📨 WebSocket message received:', data);
        
        switch (data.type) {
          case 'classification_progress':
            console.log('📊 Classification progress update:', data);
            setProgress({
              invoiceId: data.invoiceId,
              processed: data.processed || 0,
              total: data.total || 0,
              percentage: data.percentage || 0,
              currentItem: data.currentItem
            });
            setIsProcessing(true);
            break;
            
          case 'classification_complete':
            console.log('✅ Classification complete:', data);
            setProgress(null);
            setIsProcessing(false);
            // Invalidate queries to refresh data
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['invoice', data.invoiceId] });
            break;
            
          case 'line_item_classified':
            console.log('📋 Line item classified:', data);
            // Update specific line item in cache
            handleLineItemUpdate(data);
            break;
            
          case 'classification_error':
            console.error('❌ Classification error:', data.error);
            setProgress(null);
            setIsProcessing(false);
            break;
            
          case 'welcome':
          case 'subscribed':
            console.log('📡 WebSocket connection established:', data.message);
            break;

          // Handle progress tracker messages
          case 'progress_update':
          case 'classification_started':
          case 'step_updated':
          case 'metrics_updated':
            console.log('📈 Progress tracker update:', data);
            if (data.data) {
              const progressData = data.data;
              setProgress({
                invoiceId: progressData.currentInvoice || 0,
                processed: progressData.metrics?.processedItems || 0,
                total: progressData.metrics?.totalItems || 0,
                percentage: progressData.percentage || 0,
                currentItem: progressData.currentStep < progressData.steps.length 
                  ? progressData.steps[progressData.currentStep]?.description 
                  : undefined
              });
              setIsProcessing(progressData.status === 'processing');
            }
            break;

          case 'classification_finished':
            console.log('✅ Classification finished:', data);
            setProgress(null);
            setIsProcessing(false);
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            break;
            
          default:
            console.log('❓ Unknown WebSocket message type:', data.type);
        }
      } catch (error) {
        console.error('❌ Error parsing WebSocket message:', error);
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
