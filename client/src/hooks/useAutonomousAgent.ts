/**
 * React hook for using the Autonomous Invoice Processing Agent
 * 
 * Provides a clean interface for processing invoices with the autonomous agent,
 * including progress tracking, error handling, and result management.
 */

import { useState, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

export interface AgentConfig {
  classification_method: 'ai' | 'keyword' | 'hybrid';
  use_websocket_progress: boolean;
  enable_duplicate_detection: boolean;
  auto_approve_threshold: number;
  timeout_seconds: number;
  max_retries: number;
  backoff_strategy: 'exponential' | 'linear';
  retry_on: string[];
}

export interface AgentProcessingResult {
  success: boolean;
  final_status: 'pending' | 'extracted' | 'classified' | 'validated' | 'approved' | 'failed';
  processing_time_ms: number;
  metrics: {
    processing_time: number;
    classification_confidence?: number;
    validation_score?: number;
    match_accuracy?: number;
  };
  error?: string;
}

export interface AgentResponse {
  success: boolean;
  result: AgentProcessingResult;
  agent: {
    name: string;
    version: string;
    capabilities: string[];
  };
}

export interface ProcessingProgress {
  percentage: number;
  currentStep: number;
  totalSteps: number;
  message: string;
  stepDetails?: string;
}

export function useAutonomousAgent() {
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Get agent configuration
  const { data: agentConfig, isLoading: configLoading } = useQuery({
    queryKey: ['agent-config'],
    queryFn: async (): Promise<{ config: AgentConfig; agent: any }> => {
      const response = await fetch('/api/agent/config', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch agent configuration');
      }

      const data = await response.json();
      return data;
    },
  });

  // Process invoice with autonomous agent
  const processInvoiceMutation = useMutation({
    mutationFn: async ({
      file,
      fileName,
      config,
      additionalContext,
    }: {
      file: File | Buffer | string;
      fileName: string;
      config?: Partial<AgentConfig>;
      additionalContext?: Record<string, any>;
    }): Promise<AgentResponse> => {
      let fileData: string;
      
      if (file instanceof File) {
        // Convert File to base64
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fileData = buffer.toString('base64');
      } else if (Buffer.isBuffer(file)) {
        fileData = file.toString('base64');
      } else {
        fileData = file;
      }

      const requestBody = {
        file: fileData,
        fileName,
        config: {
          ...agentConfig?.config,
          ...config,
        },
        additionalContext: {
          source: 'frontend-ui',
          timestamp: new Date().toISOString(),
          ...additionalContext,
        },
        company_id: localStorage.getItem('company_id'),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: 'en',
      };

      const response = await fetch('/api/agent/process-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Agent processing failed');
      }

      return await response.json();
    },
    onSuccess: (data) => {
      console.log('✅ Agent processing completed:', data);
      // Clear progress after successful completion
      setTimeout(() => setProgress(null), 2000);
    },
    onError: (error) => {
      console.error('❌ Agent processing failed:', error);
      setProgress(null);
    },
  });

  // WebSocket connection for real-time progress updates
  const connectWebSocket = useCallback((sessionId?: string) => {
    if (!agentConfig?.config.use_websocket_progress) {
      return;
    }

    const ws = new WebSocket(`ws://${window.location.host}/ws`);
    
    ws.onopen = () => {
      setIsConnected(true);
      console.log('🔌 Agent WebSocket connected');
      
      if (sessionId) {
        ws.send(JSON.stringify({
          type: 'subscribe_progress',
          sessionId: sessionId,
        }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📨 Agent WebSocket message:', data);

        switch (data.type) {
          case 'progress_update':
            if (data.data) {
              setProgress({
                percentage: data.data.percentage || 0,
                currentStep: data.data.currentStep || 0,
                totalSteps: data.data.totalSteps || 9,
                message: data.data.message || 'Processing...',
                stepDetails: data.data.stepDetails,
              });
            }
            break;

          case 'step_progress':
            if (data.data) {
              setProgress({
                percentage: Math.round((data.data.currentStep / data.data.totalSteps) * 100),
                currentStep: data.data.currentStep || 0,
                totalSteps: data.data.totalSteps || 9,
                message: data.data.steps?.[data.data.currentStep]?.step || 'Processing...',
                stepDetails: data.data.steps?.[data.data.currentStep]?.description,
              });
            }
            break;

          case 'classification_started':
            setProgress({
              percentage: 0,
              currentStep: 6,
              totalSteps: 9,
              message: 'Starting classification...',
              stepDetails: 'Classifying line items with AI',
            });
            break;

          case 'classification_finished':
            setProgress({
              percentage: 100,
              currentStep: 9,
              totalSteps: 9,
              message: 'Classification completed',
              stepDetails: 'All line items classified successfully',
            });
            break;

          case 'classification_error':
            console.error('❌ Classification error:', data.error);
            setProgress(null);
            break;

          default:
            console.log('📨 Unknown agent message type:', data.type);
        }
      } catch (err) {
        console.error('❌ Error parsing agent WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('🔌 Agent WebSocket disconnected');
    };

    ws.onerror = (error) => {
      console.error('❌ Agent WebSocket error:', error);
      setIsConnected(false);
    };

    return ws;
  }, [agentConfig?.config.use_websocket_progress]);

  // Process invoice with progress tracking
  const processInvoiceWithProgress = useCallback(async ({
    file,
    fileName,
    config,
    additionalContext,
  }: {
    file: File | Buffer | string;
    fileName: string;
    config?: Partial<AgentConfig>;
    additionalContext?: Record<string, any>;
  }) => {
    // Connect WebSocket for progress updates
    const ws = connectWebSocket();

    try {
      const result = await processInvoiceMutation.mutateAsync({
        file,
        fileName,
        config,
        additionalContext,
      });

      return result;
    } finally {
      // Close WebSocket connection
      if (ws) {
        ws.close();
      }
    }
  }, [processInvoiceMutation, connectWebSocket]);

  return {
    // Configuration
    agentConfig: agentConfig?.config,
    agentInfo: agentConfig?.agent,
    configLoading,

    // Processing
    processInvoice: processInvoiceMutation.mutate,
    processInvoiceAsync: processInvoiceWithProgress,
    isProcessing: processInvoiceMutation.isPending,
    processingError: processInvoiceMutation.error,
    processingResult: processInvoiceMutation.data,

    // Progress tracking
    progress,
    isConnected,
    connectWebSocket,

    // Utilities
    reset: () => {
      setProgress(null);
      processInvoiceMutation.reset();
    },
  };
}

export default useAutonomousAgent;
