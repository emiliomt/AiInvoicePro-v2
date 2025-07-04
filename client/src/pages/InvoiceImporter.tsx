import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Edit, Play, Settings, Calendar, Clock, FileText, Download, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';
import Header from '@/components/Header';
import { ProgressTracker } from '@/components/ProgressTracker';

// Form schema for invoice importer configuration
const invoiceImporterConfigSchema = z.object({
  taskName: z.string().min(1, 'Task name is required'),
  description: z.string().optional(),
  connectionId: z.number().min(1, 'ERP connection is required'),
  fileTypes: z.enum(['xml', 'pdf', 'both']).default('both'),
  scheduleType: z.enum(['once', 'daily', 'weekly', 'hourly', 'multiple_daily']).default('once'),
  scheduleTime: z.string().optional(),
  scheduleDay: z.string().optional(),
});

type InvoiceImporterConfigForm = z.infer<typeof invoiceImporterConfigSchema>;

interface InvoiceImporterConfig {
  id: number;
  taskName: string;
  description?: string;
  connectionId: number;
  fileTypes: 'xml' | 'pdf' | 'both';
  scheduleType: 'once' | 'daily' | 'weekly' | 'hourly' | 'multiple_daily';
  scheduleTime?: string;
  scheduleDay?: string;
  isActive: boolean;
  lastRun?: string;
  nextRun?: string;
  createdAt: string;
  updatedAt: string;
  connection: {
    id: number;
    name: string;
    baseUrl: string;
    isActive: boolean;
  };
}

interface InvoiceImporterLog {
  id: number;
  configId: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalInvoices: number;
  processedInvoices: number;
  successfulImports: number;
  failedImports: number;
  logs?: string;
  errorMessage?: string;
  executionTime?: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

interface ERPConnection {
  id: number;
  name: string;
  baseUrl: string;
  isActive: boolean;
}

export default function InvoiceImporter() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<InvoiceImporterConfig | null>(null);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<InvoiceImporterConfig | null>(null);
  const [runningTasks, setRunningTasks] = useState<Set<number>>(new Set());
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false);

  // Fetch invoice importer configurations
  const { data: configs = [], isLoading: configsLoading } = useQuery<InvoiceImporterConfig[]>({
    queryKey: ['/api/invoice-importer/configs'],
  });

  // Fetch ERP connections
  const { data: connections = [], isLoading: connectionsLoading } = useQuery<ERPConnection[]>({
    queryKey: ['/api/erp-connections'],
  });

  // Fetch logs for selected configuration
  const { data: importerLogs = [], isLoading: logsLoading } = useQuery<InvoiceImporterLog[]>({
    queryKey: ['/api/invoice-importer/logs', selectedConfig?.id],
    enabled: !!selectedConfig,
  });

  // Form setup
  const form = useForm<InvoiceImporterConfigForm>({
    resolver: zodResolver(invoiceImporterConfigSchema),
    defaultValues: {
      taskName: '',
      description: '',
      connectionId: 0,
      fileTypes: 'both',
      scheduleType: 'once',
      scheduleTime: '',
      scheduleDay: '',
    },
  });

  // Create/Update configuration mutation
  const saveConfigMutation = useMutation({
    mutationFn: async (data: InvoiceImporterConfigForm) => {
      if (editingConfig) {
        const res = await apiRequest('PUT', `/api/invoice-importer/configs/${editingConfig.id}`, data);
        return await res.json();
      } else {
        const res = await apiRequest('POST', '/api/invoice-importer/configs', data);
        return await res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoice-importer/configs'] });
      setShowConfigModal(false);
      setEditingConfig(null);
      form.reset();
      toast({
        title: "Success",
        description: `Configuration ${editingConfig ? 'updated' : 'created'} successfully`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save configuration",
        variant: "destructive",
      });
    },
  });

  // Delete configuration mutation
  const deleteConfigMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/invoice-importer/configs/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoice-importer/configs'] });
      toast({
        title: "Success",
        description: "Configuration deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete configuration",
        variant: "destructive",
      });
    },
  });

  // Run import task mutation
  const runImportMutation = useMutation({
    mutationFn: async (configId: number) => {
      const res = await apiRequest('POST', `/api/invoice-importer/run/${configId}`);
      return await res.json();
    },
    onSuccess: (data, configId) => {
      setRunningTasks(prev => new Set(prev).add(configId));
      toast({
        title: "Success",
        description: "Import task started successfully",
      });
      // Poll for progress updates
      const pollInterval = setInterval(async () => {
        try {
          const res = await apiRequest('GET', `/api/invoice-importer/progress/${data.logId}`);
          const responseText = await res.text();

          // Check if response is valid JSON
          let progress;
          try {
            progress = JSON.parse(responseText);
          } catch (jsonError) {
            console.error('JSON parsing error:', jsonError);
            console.error('Response text:', responseText);
            console.error('Response status:', res.status);
            clearInterval(pollInterval);
            setRunningTasks(prev => {
              const newSet = new Set(prev);
              newSet.delete(configId);
              return newSet;
            });
            return;
          }

          if (progress.status === 'completed' || progress.status === 'failed') {
            clearInterval(pollInterval);
            setRunningTasks(prev => {
              const newSet = new Set(prev);
              newSet.delete(configId);
              return newSet;
            });
            queryClient.invalidateQueries({ queryKey: ['/api/invoice-importer/logs', configId] });
          }
        } catch (error) {
          console.error('Progress polling error:', error);
          clearInterval(pollInterval);
          setRunningTasks(prev => {
            const newSet = new Set(prev);
            newSet.delete(configId);
            return newSet;
          });
        }
      }, 2000);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start import task",
        variant: "destructive",
      });
    },
  });

  const handleCreateConfig = () => {
    setEditingConfig(null);
    form.reset();
    setShowConfigModal(true);
  };

  const handleEditConfig = (config: InvoiceImporterConfig) => {
    setEditingConfig(config);
    form.reset({
      taskName: config.taskName,
      description: config.description || '',
      connectionId: config.connectionId,
      fileTypes: config.fileTypes,
      scheduleType: config.scheduleType,
      scheduleTime: config.scheduleTime || '',
      scheduleDay: config.scheduleDay || '',
    });
    setShowConfigModal(true);
  };

  const handleDeleteConfig = (config: InvoiceImporterConfig) => {
    if (confirm(`Are you sure you want to delete the configuration "${config.taskName}"?`)) {
      deleteConfigMutation.mutate(config.id);
    }
  };

  const handleRunImport = (config: InvoiceImporterConfig) => {
    runImportMutation.mutate(config.id);
  };

  const handleViewLogs = (config: InvoiceImporterConfig) => {
    setSelectedConfig(config);
    setShowLogsModal(true);
  };

  const onSubmit = (data: InvoiceImporterConfigForm) => {
    saveConfigMutation.mutate(data);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-100 text-green-800">Completed</Badge>;
      case 'running':
        return <Badge variant="default" className="bg-blue-100 text-blue-800">Running</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getScheduleText = (config: InvoiceImporterConfig) => {
    switch (config.scheduleType) {
      case 'once':
        return 'One-time';
      case 'daily':
        return `Daily at ${config.scheduleTime || '00:00'}`;
      case 'weekly':
        return `Weekly on ${config.scheduleDay || 'Monday'} at ${config.scheduleTime || '00:00'}`;
      case 'hourly':
        return `Every ${config.scheduleTime || '1'} hour(s)`;
      case 'multiple_daily':
        return `${config.scheduleTime || '1'} times per day`;
      default:
        return 'Not scheduled';
    }
  };

  const handleRunNow = async (configId: number) => {
    setIsRunning(true);
    setShowProgress(true);
    setLogs([]);
    setProgress(0);

    // Show immediate feedback
    toast({
      title: "Starting Import",
      description: "Initializing ERP invoice import process...",
    });

    try {
      const response = await fetch(`/api/invoice-importer/run/${configId}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to start import');
      }

      const result = await response.json();
      toast({
        title: "Import Started",
        description: "ERP invoice import is now running. Check the progress below.",
      });

      // Refresh the configurations to update the "Last Run" status
      // refetch(); // 'refetch' is not defined. Remove it to avoid errors.
    } catch (error) {
      console.error('Error starting import:', error);
      toast({
        title: "Error",
        description: "Failed to start import process.",
        variant: "destructive",
      });
      setShowProgress(false);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">ERP Invoice Importer</h1>
          <p className="text-gray-600 mt-2">
            Automatically import invoices from your ERP systems on a scheduled basis
          </p>
        </div>

        {/* Action Button */}
        <div className="mb-6">
          <Button onClick={handleCreateConfig} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create Import Configuration
          </Button>
        </div>

        {/* Configurations List */}
        <div className="grid gap-6">
          {configsLoading ? (
            <div className="text-center py-8">Loading configurations...</div>
          ) : configs.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <FileText className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600">No import configurations found</p>
                <p className="text-sm text-gray-500 mt-2">
                  Create your first configuration to start importing invoices automatically
                </p>
              </CardContent>
            </Card>
          ) : (
            configs.map((config: InvoiceImporterConfig) => (
              <Card key={config.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {config.taskName}
                        {!config.isActive && (
                          <Badge variant="outline" className="text-xs">Inactive</Badge>
                        )}
                      </CardTitle>
                      <CardDescription>{config.description}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewLogs(config)}
                        className="flex items-center gap-1"
                      >
                        <Activity className="w-4 h-4" />
                        Logs
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditConfig(config)}
                        className="flex items-center gap-1"
                      >
                        <Edit className="w-4 h-4" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRunImport(config)}
                        disabled={runningTasks.has(config.id)}
                        className="flex items-center gap-1"
                      >
                        <Play className="w-4 h-4" />
                        {runningTasks.has(config.id) ? 'Running...' : 'Run Now'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteConfig(config)}
                        className="flex items-center gap-1 text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-gray-500">ERP Connection</Label>
                      <p className="text-sm">{config.connection?.name || 'Unknown'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">File Types</Label>
                      <p className="text-sm capitalize">{config.fileTypes}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Schedule</Label>
                      <p className="text-sm">{getScheduleText(config)}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Last Run</Label>
                      <p className="text-sm">
                        {config.lastRun ? format(new Date(config.lastRun), 'MMM dd, yyyy HH:mm') : 'Never'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Next Run</Label>
                      <p className="text-sm">
                        {config.nextRun ? format(new Date(config.nextRun), 'MMM dd, yyyy HH:mm') : 'Not scheduled'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Configuration Modal */}
        <Dialog open={showConfigModal} onOpenChange={setShowConfigModal}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>
                {editingConfig ? 'Edit Import Configuration' : 'Create Import Configuration'}
              </DialogTitle>
              <DialogDescription>
                Configure automatic invoice importing from your ERP system
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="taskName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Task Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter task name" {...field} />
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
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Enter description (optional)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="connectionId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ERP Connection</FormLabel>
                      <Select onValueChange={(value) => field.onChange(parseInt(value))}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select ERP connection" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {connections.map((connection: ERPConnection) => (
                            <SelectItem key={connection.id} value={connection.id.toString()}>
                              {connection.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fileTypes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>File Types</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select file types" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="xml">XML Only</SelectItem>
                          <SelectItem value="pdf">PDF Only</SelectItem>
                          <SelectItem value="both">Both XML and PDF</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="scheduleType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Schedule Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select schedule type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="once">One-time</SelectItem>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="hourly">Hourly</SelectItem>
                          <SelectItem value="multiple_daily">Multiple times daily</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowConfigModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saveConfigMutation.isPending}>
                    {saveConfigMutation.isPending ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Logs Modal */}
        <Dialog open={showLogsModal} onOpenChange={setShowLogsModal}>
          <DialogContent className="sm:max-w-[800px]">
            <DialogHeader>
              <DialogTitle>Import Logs - {selectedConfig?.taskName}</DialogTitle>
              <DialogDescription>
                View execution history and logs for this import configuration
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {logsLoading ? (
                <div className="text-center py-4">Loading logs...</div>
              ) : importerLogs.length === 0 ? (
                <div className="text-center py-4 text-gray-500">
                  No execution logs found
                </div>
              ) : (
                importerLogs.map((log: InvoiceImporterLog) => (
                  <Card key={log.id}>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-sm flex items-center gap-2">
                            {getStatusBadge(log.status)}
                            <span className="text-gray-500">
                              {format(new Date(log.createdAt), 'MMM dd, yyyy HH:mm')}
                            </span>
                          </CardTitle>
                        </div>
                        <div className="text-right text-sm text-gray-500">
                          {log.executionTime && `${log.executionTime}ms`}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <Label className="text-xs text-gray-500">Total</Label>
                          <p>{log.totalInvoices}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">Processed</Label>
                          <p>{log.processedInvoices}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">Success</Label>
                          <p className="text-green-600">{log.successfulImports}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">Failed</Label>
                          <p className="text-red-600">{log.failedImports}</p>
                        </div>
                      </div>
                      {log.errorMessage && (
                        <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-700">
                          {log.errorMessage}
                        </div>
                      )}
                      {log.status === 'running' && (
                        <div className="mt-2">
                          <ProgressTracker 
                            userId="current-user"
                            taskId={log.id} 
                            onComplete={() => {
                              queryClient.invalidateQueries({ 
                                queryKey: ['/api/invoice-importer/logs', selectedConfig?.id] 
                              });
                            }}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}