import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Play, Settings2, Trash2, Edit, Clock, Terminal, Calendar, CheckCircle, XCircle, AlertCircle, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import Header from '@/components/Header';

// Form schema for invoice importer configuration
const importerConfigSchema = z.object({
  name: z.string().min(1, 'Configuration name is required'),
  taskName: z.string().min(1, 'Task name is required'),
  connectionId: z.number().optional(),
  isManualConfig: z.boolean().default(false),
  erpUrl: z.string().url().optional(),
  erpUsername: z.string().optional(),
  erpPassword: z.string().optional(),
  sincoFullPath: z.string().optional(),
  downloadPath: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

type ImporterConfigForm = z.infer<typeof importerConfigSchema>;

interface ImporterConfig {
  id: number;
  name: string;
  taskName: string;
  connectionId?: number;
  isManualConfig: boolean;
  erpUrl?: string;
  erpUsername?: string;
  sincoFullPath?: string;
  downloadPath?: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ERPConnection {
  id: number;
  name: string;
  baseUrl: string;
  username: string;
  isActive: boolean;
}

export default function InvoiceImporter() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ImporterConfig | null>(null);
  const [runningTasks, setRunningTasks] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<string>('configurations');
  const [consoleDialogOpen, setConsoleDialogOpen] = useState(false);
  const [selectedConfigLogs, setSelectedConfigLogs] = useState<any[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ImporterConfigForm>({
    resolver: zodResolver(importerConfigSchema),
    defaultValues: {
      name: '',
      taskName: '',
      isManualConfig: false,
      description: '',
      isActive: true,
    },
  });

  // Watch manual config toggle
  const isManualConfig = form.watch('isManualConfig');

  // Fetch invoice importer configurations
  const { data: configs = [], isLoading } = useQuery<ImporterConfig[]>({
    queryKey: ['/api/invoice-importer/configs'],
    refetchInterval: 5000, // Refresh every 5 seconds to get latest status
  });

  // Fetch ERP connections for dropdown
  const { data: connections = [] } = useQuery<ERPConnection[]>({
    queryKey: ['/api/erp/connections'],
  });

  // Fetch logs for progress tracking
  const { data: logs = [] } = useQuery<any[]>({
    queryKey: ['/api/invoice-importer/logs'],
    refetchInterval: 2000, // Refresh every 2 seconds when tasks are running
    enabled: runningTasks.size > 0,
  });

  // Create configuration mutation
  const createConfigMutation = useMutation({
    mutationFn: async (data: ImporterConfigForm) => {
      const response = await fetch('/api/invoice-importer/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoice-importer/configs'] });
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: 'Configuration Created',
        description: 'Invoice importer configuration has been created successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create configuration',
        variant: 'destructive',
      });
    },
  });

  // Update configuration mutation
  const updateConfigMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ImporterConfigForm }) => {
      const response = await fetch(`/api/invoice-importer/configs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoice-importer/configs'] });
      setIsDialogOpen(false);
      form.reset();
      setEditingConfig(null);
      toast({
        title: 'Configuration Updated',
        description: 'Invoice importer configuration has been updated successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update configuration',
        variant: 'destructive',
      });
    },
  });

  // Delete configuration mutation
  const deleteConfigMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/invoice-importer/configs/${id}`, {
        method: 'DELETE',
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoice-importer/configs'] });
      toast({
        title: 'Configuration Deleted',
        description: 'Invoice importer configuration has been deleted successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete configuration',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: ImporterConfigForm) => {
    if (editingConfig) {
      updateConfigMutation.mutate({ id: editingConfig.id, data });
    } else {
      createConfigMutation.mutate(data);
    }
  };

  const handleEdit = (config: ImporterConfig) => {
    setEditingConfig(config);
    form.reset({
      name: config.name,
      taskName: config.taskName,
      connectionId: config.connectionId,
      isManualConfig: config.isManualConfig,
      erpUrl: config.erpUrl || '',
      erpUsername: config.erpUsername || '',
      erpPassword: '', // Don't populate password for security
      sincoFullPath: config.sincoFullPath || '',
      downloadPath: config.downloadPath || '',
      description: config.description || '',
      isActive: config.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this configuration?')) {
      deleteConfigMutation.mutate(id);
    }
  };

  const handleAddNew = () => {
    setEditingConfig(null);
    form.reset();
    setIsDialogOpen(true);
  };

  const handleStartImport = (configId: number) => {
    setRunningTasks(prev => new Set(prev).add(configId));
  };

  const getConfigStatus = (configId: number) => {
    const latestLog = logs.find((log: any) => log.configId === configId);
    if (!latestLog) return 'idle';
    return latestLog.status === 'running' ? 'running' : 
           latestLog.status === 'completed' ? 'completed' : 
           latestLog.status === 'failed' ? 'failed' : 'idle';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200"><Play className="w-3 h-3 mr-1" />Running</Badge>;
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800 border-red-200"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="secondary"><Pause className="w-3 h-3 mr-1" />Idle</Badge>;
    }
  };

  const getProgressData = (configId: number) => {
    const latestLog = logs.find((log: any) => log.configId === configId);
    if (!latestLog || latestLog.status !== 'running') return null;
    
    return {
      progress: Math.round((latestLog.processedInvoices / Math.max(latestLog.totalInvoices, 1)) * 100),
      currentStep: 'Processing invoices...',
      stats: {
        total: latestLog.totalInvoices || 0,
        processed: latestLog.processedInvoices || 0,
        successful: latestLog.successfulImports || 0,
        failed: latestLog.failedImports || 0
      }
    };
  };

  const handleRunNow = async (configId: number) => {
    try {
      setRunningTasks(prev => new Set(prev).add(configId));
      
      const response = await fetch(`/api/invoice-importer/start/${configId}`, {
        method: 'POST',
      });
      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Import Started',
          description: 'Invoice import process has been initiated.',
        });
      } else {
        throw new Error(result.error || 'Failed to start import');
      }
    } catch (error) {
      console.error('Error starting import:', error);
      setRunningTasks(prev => {
        const newSet = new Set(prev);
        newSet.delete(configId);
        return newSet;
      });
      toast({
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'Failed to start import process',
        variant: 'destructive',
      });
    }
  };

  const handleViewLogs = (configId: number) => {
    const configLogs = logs.filter((log: any) => log.configId === configId);
    setSelectedConfigLogs(configLogs);
    setConsoleDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Invoice Importer</h1>
            <p className="text-gray-600 mt-2">
              Configure automated ERP invoice import processes
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleAddNew} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700">
                <Plus size={16} />
                Create Import Configuration
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingConfig ? 'Edit Importer Configuration' : 'Add Importer Configuration'}
                </DialogTitle>
                <DialogDescription>
                  Configure automated invoice importing from your ERP system.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Configuration Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., SINCO Invoice Import" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="taskName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Task Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Import Daily Invoices" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isManualConfig"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Manual Configuration</FormLabel>
                          <div className="text-sm text-muted-foreground">
                            Use manual ERP credentials instead of existing connection
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {!isManualConfig ? (
                    <FormField
                      control={form.control}
                      name="connectionId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ERP Connection</FormLabel>
                          <Select 
                            onValueChange={(value) => field.onChange(parseInt(value))}
                            value={field.value?.toString() || ''}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select an ERP connection" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {connections.map((connection) => (
                                <SelectItem key={connection.id} value={connection.id.toString()}>
                                  {connection.name} ({connection.baseUrl})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <>
                      <FormField
                        control={form.control}
                        name="erpUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>ERP URL</FormLabel>
                            <FormControl>
                              <Input placeholder="https://your-erp-system.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="erpUsername"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Username</FormLabel>
                              <FormControl>
                                <Input placeholder="your.username" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="erpPassword"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Password</FormLabel>
                              <FormControl>
                                <Input type="password" placeholder="••••••••" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </>
                  )}

                  <FormField
                    control={form.control}
                    name="sincoFullPath"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SINCO Full Path (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., /full/path/to/sinco" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="downloadPath"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Download Path (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., /downloads/invoices" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Brief description of this configuration..." 
                            className="resize-none"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Active</FormLabel>
                          <div className="text-sm text-muted-foreground">
                            Enable this configuration for automated imports
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end space-x-3">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit"
                      disabled={createConfigMutation.isPending || updateConfigMutation.isPending}
                    >
                      {editingConfig ? 'Update' : 'Create'} Configuration
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="configurations">Configurations</TabsTrigger>
            <TabsTrigger value="logs">Import Logs</TabsTrigger>
            <TabsTrigger value="schedule">Schedule Overview</TabsTrigger>
          </TabsList>

          <TabsContent value="configurations" className="space-y-6">
            {configs.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Settings2 className="h-16 w-16 text-gray-400 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Import Configurations</h3>
                  <p className="text-gray-600 text-center mb-4">
                    Create your first invoice importer configuration to start automating invoice processing.
                  </p>
                  <Button onClick={handleAddNew} className="flex items-center gap-2">
                    <Plus size={16} />
                    Create Configuration
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {configs.map((config) => {
                  const status = getConfigStatus(config.id);
                  const progressData = getProgressData(config.id);
                  const connection = connections.find(c => c.id === config.connectionId);
                  
                  return (
                    <Card key={config.id} className="w-full">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                        <div className="flex items-center space-x-3">
                          <Clock className="h-5 w-5 text-gray-400" />
                          <div>
                            <CardTitle className="text-lg">{config.name}</CardTitle>
                            <CardDescription>{config.taskName}</CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {getStatusBadge(status)}
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRunNow(config.id)}
                              disabled={status === 'running'}
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(config)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(config.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <div className="text-sm">
                              <span className="font-medium text-gray-700">ERP Connection:</span>
                              <div className="text-gray-600">
                                {config.isManualConfig ? 'Manual Configuration' : 
                                 connection ? `${connection.name} (ID: ${connection.id})` : 'Not Found'}
                              </div>
                            </div>
                            <div className="text-sm">
                              <span className="font-medium text-gray-700">Schedule:</span>
                              <div className="text-gray-600">Manual execution</div>
                            </div>
                            <div className="text-sm">
                              <span className="font-medium text-gray-700">File Types:</span>
                              <div className="text-gray-600">PDF, XML</div>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="text-sm">
                              <span className="font-medium text-gray-700">Last Run:</span>
                              <div className="text-gray-600">
                                {logs.find((log: any) => log.configId === config.id)?.completedAt 
                                  ? new Date(logs.find((log: any) => log.configId === config.id)?.completedAt).toLocaleString()
                                  : 'Never'
                                }
                              </div>
                            </div>
                            <div className="text-sm">
                              <span className="font-medium text-gray-700">Next Run:</span>
                              <div className="text-gray-600">Manual</div>
                            </div>
                            <div className="text-sm">
                              <span className="font-medium text-gray-700">Status:</span>
                              <div className="text-gray-600">{config.isActive ? 'Active' : 'Inactive'}</div>
                            </div>
                          </div>
                        </div>

                        {status === 'running' && progressData && (
                          <div className="border-t pt-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Progress: {progressData.progress}%</span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewLogs(config.id)}
                                className="text-xs"
                              >
                                <Terminal className="h-3 w-3 mr-1" />
                                Console
                              </Button>
                            </div>
                            <Progress value={progressData.progress} className="h-2" />
                            <div className="text-sm text-gray-600">{progressData.currentStep}</div>
                            
                            <div className="grid grid-cols-4 gap-4 text-center text-sm">
                              <div>
                                <div className="font-medium text-gray-900">{progressData.stats.total}</div>
                                <div className="text-gray-500">Total</div>
                              </div>
                              <div>
                                <div className="font-medium text-blue-600">{progressData.stats.processed}</div>
                                <div className="text-gray-500">Processed</div>
                              </div>
                              <div>
                                <div className="font-medium text-green-600">{progressData.stats.successful}</div>
                                <div className="text-gray-500">Success</div>
                              </div>
                              <div>
                                <div className="font-medium text-red-600">{progressData.stats.failed}</div>
                                <div className="text-gray-500">Failed</div>
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Import Execution History</CardTitle>
                <CardDescription>
                  Historical logs of all invoice import executions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {logs.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No import logs available
                  </div>
                ) : (
                  <div className="space-y-3">
                    {logs.map((log: any, index: number) => {
                      const config = configs.find(c => c.id === log.configId);
                      return (
                        <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center space-x-3">
                            {getStatusBadge(log.status)}
                            <div>
                              <div className="font-medium">{config?.name || 'Unknown Config'}</div>
                              <div className="text-sm text-gray-500">
                                {log.startedAt ? new Date(log.startedAt).toLocaleString() : 'Unknown time'}
                              </div>
                            </div>
                          </div>
                          <div className="text-right text-sm text-gray-600">
                            <div>Processed: {log.processedInvoices || 0}/{log.totalInvoices || 0}</div>
                            <div>Success: {log.successfulImports || 0} | Failed: {log.failedImports || 0}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schedule" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Schedule Overview
                </CardTitle>
                <CardDescription>
                  View and manage scheduled import tasks
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  <Calendar className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-medium mb-2">Schedule Management</h3>
                  <p className="text-sm">
                    Scheduled imports are not yet configured. All imports are currently set to manual execution.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Console Dialog */}
        <Dialog open={consoleDialogOpen} onOpenChange={setConsoleDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                Import Console Logs
              </DialogTitle>
              <DialogDescription>
                Real-time logs for the selected import configuration
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-96 overflow-y-auto bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm">
              {selectedConfigLogs.length === 0 ? (
                <div className="text-gray-400">No logs available for this configuration</div>
              ) : (
                selectedConfigLogs.map((log: any, index: number) => (
                  <div key={index} className="space-y-1">
                    <div className="text-gray-300 text-xs">
                      {log.startedAt ? new Date(log.startedAt).toLocaleString() : 'Unknown time'} - {log.status}
                    </div>
                    <div className="text-green-400 whitespace-pre-wrap">
                      {log.logs || 'No detailed logs available'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}