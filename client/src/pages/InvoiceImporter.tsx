import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Play, Settings2, Trash2, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import Header from '@/components/Header';
import InvoiceImporterProgress from '@/components/InvoiceImporterProgress';

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
  const { data: logs = [] } = useQuery({
    queryKey: ['/api/invoice-importer/logs'],
    refetchInterval: 2000, // Refresh every 2 seconds when tasks are running
    enabled: runningTasks.size > 0,
  });

  // Create configuration mutation
  const createConfigMutation = useMutation({
    mutationFn: (data: ImporterConfigForm) =>
      apiRequest('/api/invoice-importer/configs', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
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
    mutationFn: ({ id, data }: { id: number; data: ImporterConfigForm }) =>
      apiRequest(`/api/invoice-importer/configs/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
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
    mutationFn: (id: number) =>
      apiRequest(`/api/invoice-importer/configs/${id}`, {
        method: 'DELETE',
      }),
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
              Automated invoice importing from ERP systems with real-time progress tracking
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleAddNew} className="flex items-center gap-2">
                <Plus size={16} />
                Add Configuration
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
                Add Configuration
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {configs.map((config) => (
              <div key={config.id} className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">{config.name}</CardTitle>
                        <CardDescription>{config.taskName}</CardDescription>
                      </div>
                      <div className="flex gap-2">
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
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm text-gray-600">
                      {config.description && <p>{config.description}</p>}
                      <p><strong>Type:</strong> {config.isManualConfig ? 'Manual Configuration' : 'ERP Connection'}</p>
                      {config.sincoFullPath && <p><strong>Path:</strong> {config.sincoFullPath}</p>}
                    </div>
                  </CardContent>
                </Card>

                {/* Progress Tracker Component */}
                <InvoiceImporterProgress
                  configId={config.id}
                  configName={config.name}
                  onStartImport={() => handleStartImport(config.id)}
                />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}