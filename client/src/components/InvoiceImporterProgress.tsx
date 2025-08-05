import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import ProgressTracker from './ProgressTracker';

interface ImporterConfig {
  id: number;
  name: string;
  taskName: string;
  status: 'running' | 'completed' | 'failed' | 'idle';
  progress?: number;
  currentStep?: string;
  stats?: {
    total_invoices: number;
    processed_invoices: number;
    successful_imports: number;
    failed_imports: number;
  };
}

interface InvoiceImporterProgressProps {
  configId: number;
  configName: string;
  onStartImport?: () => void;
}

export function InvoiceImporterProgress({ 
  configId, 
  configName, 
  onStartImport 
}: InvoiceImporterProgressProps) {
  const [config, setConfig] = useState<ImporterConfig>({
    id: configId,
    name: configName,
    taskName: `Import task for ${configName}`,
    status: 'idle',
    progress: 0,
    currentStep: '',
    stats: {
      total_invoices: 0,
      processed_invoices: 0,
      successful_imports: 0,
      failed_imports: 0
    }
  });

  const { toast } = useToast();

  // Query for latest importer logs to get current status
  const { data: logs } = useQuery({
    queryKey: ['/api/invoice-importer/logs'],
    refetchInterval: config.status === 'running' ? 2000 : false,
  });

  const handleStartImport = async () => {
    try {
      setConfig(prev => ({ ...prev, status: 'running', progress: 0 }));
      
      const response = await apiRequest(`/api/invoice-importer/start/${configId}`, {
        method: 'POST',
      });

      if (response.success) {
        toast({
          title: 'Import Started',
          description: 'Invoice import process has been initiated.',
        });
        onStartImport?.();
      } else {
        throw new Error(response.error || 'Failed to start import');
      }
    } catch (error) {
      console.error('Error starting import:', error);
      setConfig(prev => ({ ...prev, status: 'failed' }));
      toast({
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'Failed to start import process',
        variant: 'destructive',
      });
    }
  };

  const handleProgressUpdate = (update: any) => {
    setConfig(prev => ({
      ...prev,
      status: update.status || prev.status,
      progress: update.data?.progress || (update.step * (100 / (update.totalSteps || 12))),
      currentStep: update.message || prev.currentStep,
      stats: update.data ? {
        total_invoices: update.data.total_invoices || 0,
        processed_invoices: update.data.processed_invoices || 0,
        successful_imports: update.data.successful_imports || 0,
        failed_imports: update.data.failed_imports || 0
      } : prev.stats
    }));
  };

  // Update status based on latest logs
  React.useEffect(() => {
    if (logs && logs.length > 0) {
      const latestLog = logs.find((log: any) => log.configId === configId);
      if (latestLog) {
        setConfig(prev => ({
          ...prev,
          status: latestLog.status,
          stats: {
            total_invoices: latestLog.totalInvoices || 0,
            processed_invoices: latestLog.processedInvoices || 0,
            successful_imports: latestLog.successfulImports || 0,
            failed_imports: latestLog.failedImports || 0
          }
        }));
      }
    }
  }, [logs, configId]);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">
              {configName}
            </CardTitle>
            <CardDescription>
              Automated invoice import from ERP system
            </CardDescription>
          </div>
          
          {config.status === 'idle' && (
            <Button 
              onClick={handleStartImport}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Start Import
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <ProgressTracker
          taskId={configId}
          status={config.status}
          progress={config.progress}
          currentStep={config.currentStep}
          stats={config.stats}
          onProgressUpdate={handleProgressUpdate}
        />
      </CardContent>
    </Card>
  );
}

export default InvoiceImporterProgress;