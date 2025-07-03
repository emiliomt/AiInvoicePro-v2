import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { FileText, Download, Play, Clock, CheckCircle, XCircle, Settings } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Header from '@/components/Header';

const importConfigSchema = z.object({
  taskName: z.string().min(1, 'Task name is required'),
  description: z.string().optional(),
  connectionId: z.number().min(1, 'Please select a connection'),
  fileTypes: z.enum(['xml', 'pdf', 'both']),
  scheduleType: z.enum(['once', 'daily', 'weekly', 'hourly', 'multiple_daily']),
  scheduleTime: z.string().optional(),
  scheduleDay: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  timesPerDay: z.number().optional(),
  spacingValue: z.number().optional(),
  spacingUnit: z.enum(['minutes', 'hours']).optional(),
}).refine((data) => {
  if (data.scheduleType === 'daily' && !data.scheduleTime) {
    return false;
  }
  if (data.scheduleType === 'weekly' && (!data.scheduleDay || !data.scheduleTime)) {
    return false;
  }
  if (data.scheduleType === 'hourly' && (!data.startTime || !data.endTime)) {
    return false;
  }
  if (data.scheduleType === 'multiple_daily') {
    if (!data.timesPerDay || !data.spacingValue || !data.spacingUnit) {
      return false;
    }
    // Validate that the spacing makes sense for the number of executions
    const spacingInMinutes = data.spacingUnit === 'hours' ? data.spacingValue * 60 : data.spacingValue;
    const totalTimeNeeded = (data.timesPerDay - 1) * spacingInMinutes;
    const minutesInDay = 24 * 60;
    
    if (totalTimeNeeded >= minutesInDay) {
      return false;
    }
  }
  return true;
}, {
  message: "Please fill in all required schedule fields and ensure spacing allows for all executions within a day",
  path: ["scheduleType"]
});

type ImportConfig = z.infer<typeof importConfigSchema>;

interface ErpConnection {
  id: number;
  name: string;
  baseUrl: string;
  username: string;
  isActive: boolean;
}

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
  connection: ErpConnection;
}

interface ImportLog {
  id: number;
  configId: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'scheduled';
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

export default function InvoiceImporter() {
  const { isAuthenticated, isLoading } = useAuth();
  const [selectedConfig, setSelectedConfig] = useState<InvoiceImporterConfig | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<'configs' | 'logs'>('configs');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ImportConfig>({
    resolver: zodResolver(importConfigSchema),
    defaultValues: {
      taskName: '',
      description: '',
      fileTypes: 'both',
      scheduleType: 'once',
      scheduleTime: '',
      scheduleDay: '',
      startTime: '',
      endTime: '',
      timesPerDay: 1,
      spacingValue: 60,
      spacingUnit: 'minutes',
    },
  });

  const watchedScheduleType = form.watch('scheduleType');

  // Fetch ERP connections
  const { data: connections = [] } = useQuery({
    queryKey: ['/api/erp/connections'],
    enabled: isAuthenticated,
  });

  // Fetch import configurations
  const { data: configs = [], isLoading: configsLoading } = useQuery({
    queryKey: ['/api/invoice-importer/configs'],
    enabled: isAuthenticated,
  });

  // Fetch logs for selected config
  const { data: logs = [] } = useQuery({
    queryKey: ['/api/invoice-importer/logs', selectedConfig?.id],
    enabled: isAuthenticated && !!selectedConfig?.id,
  });

  // Create configuration mutation
  const createConfigMutation = useMutation({
    mutationFn: async (data: ImportConfig) => {
      const response = await fetch('/api/invoice-importer/configs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to create configuration');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoice-importer/configs'] });
      setShowCreateDialog(false);
      form.reset();
      toast({
        title: "Configuration Created",
        description: "Import configuration has been created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create import configuration",
        variant: "destructive",
      });
    },
  });

  // Execute import mutation
  const executeImportMutation = useMutation({
    mutationFn: async (configId: number) => {
      const response = await fetch(`/api/invoice-importer/configs/${configId}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to execute import');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoice-importer/logs'] });
      toast({
        title: "Import Started",
        description: "Invoice import process has been started successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to start import process",
        variant: "destructive",
      });
    },
  });

  const handleCreateConfig = (data: ImportConfig) => {
    createConfigMutation.mutate(data);
  };

  const handleExecuteImport = (configId: number) => {
    executeImportMutation.mutate(configId);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'running':
        return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      running: 'bg-blue-100 text-blue-800',
      pending: 'bg-yellow-100 text-yellow-800',
      scheduled: 'bg-purple-100 text-purple-800',
    };

    return (
      <Badge className={variants[status] || 'bg-gray-100 text-gray-800'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ERP Invoice Importer</h1>
          <p className="text-muted-foreground">
            Automate invoice extraction from your ERP system using RPA technology
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <FileText className="h-4 w-4 mr-2" />
              New Import Task
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
            <DialogHeader className="pb-4 border-b">
              <DialogTitle className="text-xl font-semibold">Create Import Configuration</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Set up a new automated invoice import task from your ERP system.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleCreateConfig)} className="space-y-6 px-1">
                {/* Basic Information Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-gray-900 border-b pb-2 mb-4">Basic Information</h3>
                  
                  <FormField
                    control={form.control}
                    name="taskName"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel className="text-sm font-medium">Task Name</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g., Daily Invoice Import" 
                            className="h-10 rounded-md border border-input bg-background px-3 py-2"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel className="text-sm font-medium">Description</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Optional description of the import task"
                            className="min-h-[80px] resize-none rounded-md border border-input bg-background px-3 py-2"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="connectionId"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel className="text-sm font-medium">ERP Connection</FormLabel>
                        <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                          <FormControl>
                            <SelectTrigger className="h-10 w-full rounded-md border border-input bg-background px-3 py-2">
                              <SelectValue placeholder="Select an ERP connection" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {connections.map((connection: ErpConnection) => (
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
                </div>

                {/* File Configuration Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-gray-900 border-b pb-2 mb-4">File Configuration</h3>
                  
                  <FormField
                    control={form.control}
                    name="fileTypes"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel className="text-sm font-medium">File Types to Import</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="space-y-3"
                          >
                            <div className="flex items-center space-x-3">
                              <RadioGroupItem value="xml" id="xml" />
                              <Label htmlFor="xml" className="text-sm font-normal cursor-pointer">
                                XML only
                              </Label>
                            </div>
                            <div className="flex items-center space-x-3">
                              <RadioGroupItem value="pdf" id="pdf" />
                              <Label htmlFor="pdf" className="text-sm font-normal cursor-pointer">
                                PDF only
                              </Label>
                            </div>
                            <div className="flex items-center space-x-3">
                              <RadioGroupItem value="both" id="both" />
                              <Label htmlFor="both" className="text-sm font-normal cursor-pointer">
                                Both XML and PDF
                              </Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Schedule Configuration Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-gray-900 border-b pb-2 mb-4">Schedule Configuration</h3>
                  
                  <FormField
                    control={form.control}
                    name="scheduleType"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel className="text-sm font-medium">Import Schedule</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-10 w-full rounded-md border border-input bg-background px-3 py-2">
                              <SelectValue placeholder="Select schedule type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="once">Run once</SelectItem>
                            <SelectItem value="hourly">Every hour</SelectItem>
                            <SelectItem value="daily">Once per day</SelectItem>
                            <SelectItem value="weekly">Once per week</SelectItem>
                            <SelectItem value="multiple_daily">Multiple times per day</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Dynamic Schedule Fields */}
                  {watchedScheduleType === 'daily' && (
                    <FormField
                      control={form.control}
                      name="scheduleTime"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel className="text-sm font-medium">Time</FormLabel>
                          <FormControl>
                            <Input 
                              type="time"
                              className="h-10 rounded-md border border-input bg-background px-3 py-2"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {watchedScheduleType === 'weekly' && (
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="scheduleDay"
                        render={({ field }) => (
                          <FormItem className="space-y-2">
                            <FormLabel className="text-sm font-medium">Day of Week</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger className="h-10 rounded-md border border-input bg-background px-3 py-2">
                                  <SelectValue placeholder="Select day" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="monday">Monday</SelectItem>
                                <SelectItem value="tuesday">Tuesday</SelectItem>
                                <SelectItem value="wednesday">Wednesday</SelectItem>
                                <SelectItem value="thursday">Thursday</SelectItem>
                                <SelectItem value="friday">Friday</SelectItem>
                                <SelectItem value="saturday">Saturday</SelectItem>
                                <SelectItem value="sunday">Sunday</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="scheduleTime"
                        render={({ field }) => (
                          <FormItem className="space-y-2">
                            <FormLabel className="text-sm font-medium">Time</FormLabel>
                            <FormControl>
                              <Input 
                                type="time"
                                className="h-10 rounded-md border border-input bg-background px-3 py-2"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {watchedScheduleType === 'hourly' && (
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="startTime"
                        render={({ field }) => (
                          <FormItem className="space-y-2">
                            <FormLabel className="text-sm font-medium">Start Time</FormLabel>
                            <FormControl>
                              <Input 
                                type="time"
                                className="h-10 rounded-md border border-input bg-background px-3 py-2"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="endTime"
                        render={({ field }) => (
                          <FormItem className="space-y-2">
                            <FormLabel className="text-sm font-medium">End Time</FormLabel>
                            <FormControl>
                              <Input 
                                type="time"
                                className="h-10 rounded-md border border-input bg-background px-3 py-2"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {watchedScheduleType === 'multiple_daily' && (
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="timesPerDay"
                        render={({ field }) => (
                          <FormItem className="space-y-2">
                            <FormLabel className="text-sm font-medium">Number of executions per day</FormLabel>
                            <FormControl>
                              <Input 
                                type="number"
                                min="1"
                                max="24"
                                placeholder="e.g., 3"
                                className="h-10 rounded-md border border-input bg-background px-3 py-2"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="spacingValue"
                          render={({ field }) => (
                            <FormItem className="space-y-2">
                              <FormLabel className="text-sm font-medium">Spacing between executions</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number"
                                  min="1"
                                  placeholder="e.g., 120"
                                  className="h-10 rounded-md border border-input bg-background px-3 py-2"
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 60)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="spacingUnit"
                          render={({ field }) => (
                            <FormItem className="space-y-2">
                              <FormLabel className="text-sm font-medium">Unit</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-10 rounded-md border border-input bg-background px-3 py-2">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="minutes">Minutes</SelectItem>
                                  <SelectItem value="hours">Hours</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="startTime"
                        render={({ field }) => (
                          <FormItem className="space-y-2">
                            <FormLabel className="text-sm font-medium">Start time (optional)</FormLabel>
                            <FormControl>
                              <Input 
                                type="time"
                                className="h-10 rounded-md border border-input bg-background px-3 py-2"
                                {...field} 
                              />
                            </FormControl>
                            <FormDescription className="text-xs text-muted-foreground">
                              When should the first execution run? If not specified, executions will start immediately.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>

                <DialogFooter className="pt-6 border-t flex gap-3 justify-end">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setShowCreateDialog(false)}
                    disabled={createConfigMutation.isPending}
                    className="rounded-md"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createConfigMutation.isPending || !form.formState.isValid}
                    className="rounded-md"
                  >
                    {createConfigMutation.isPending ? 'Creating...' : 'Create Configuration'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'configs' | 'logs')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="configs">Import Configurations</TabsTrigger>
          <TabsTrigger value="logs">Execution History</TabsTrigger>
        </TabsList>

        <TabsContent value="configs" className="space-y-4">
          {configsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="h-3 bg-gray-200 rounded"></div>
                      <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : configs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Import Configurations</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Create your first automated invoice import configuration to get started.
                </p>
                <Button onClick={() => setShowCreateDialog(true)}>
                  Create Import Task
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {configs.map((config: InvoiceImporterConfig) => (
                <Card key={config.id} className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{config.taskName}</CardTitle>
                        <CardDescription>{config.connection.name}</CardDescription>
                      </div>
                      <Badge variant={config.isActive ? "default" : "secondary"}>
                        {config.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">File Types:</span>
                        <span className="capitalize">{config.fileTypes}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Schedule:</span>
                        <span className="capitalize">{config.scheduleType.replace('_', ' ')}</span>
                      </div>
                      {config.lastRun && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Last Run:</span>
                          <span>{new Date(config.lastRun).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button
                        size="sm"
                        onClick={() => handleExecuteImport(config.id)}
                        disabled={executeImportMutation.isPending}
                        className="flex-1"
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Run Now
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedConfig(config)}
                        className="flex-1"
                      >
                        <Settings className="h-3 w-3 mr-1" />
                        View Logs
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          {selectedConfig ? (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedConfig(null)}
                >
                  ← Back to All Configs
                </Button>
                <h3 className="text-lg font-semibold">{selectedConfig.taskName} - Execution History</h3>
              </div>

              {logs.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Execution History</h3>
                    <p className="text-muted-foreground text-center">
                      This import configuration hasn't been executed yet.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {logs.map((log: ImportLog) => (
                    <Card key={log.id}>
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(log.status)}
                              <CardTitle className="text-lg">
                                Execution #{log.id}
                              </CardTitle>
                              {getStatusBadge(log.status)}
                            </div>
                            <CardDescription>
                              Started: {log.startedAt ? new Date(log.startedAt).toLocaleString() : 'N/A'}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Total Invoices:</span>
                            <div className="font-medium">{log.totalInvoices}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Processed:</span>
                            <div className="font-medium">{log.processedInvoices}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Successful:</span>
                            <div className="font-medium text-green-600">{log.successfulImports}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Failed:</span>
                            <div className="font-medium text-red-600">{log.failedImports}</div>
                          </div>
                        </div>

                        {log.executionTime && (
                          <div className="mt-4 text-sm">
                            <span className="text-muted-foreground">Execution Time:</span>
                            <span className="ml-2 font-medium">
                              {Math.round(log.executionTime / 1000)}s
                            </span>
                          </div>
                        )}

                        {log.errorMessage && (
                          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                            <div className="text-sm text-red-800">
                              <strong>Error:</strong> {log.errorMessage}
                            </div>
                          </div>
                        )}

                        {log.logs && (
                          <div className="mt-4">
                            <div className="text-sm font-medium mb-2">Execution Logs:</div>
                            <div className="bg-gray-50 p-3 rounded-md text-xs font-mono max-h-40 overflow-y-auto">
                              {log.logs.split('\n').map((line, index) => (
                                <div key={index}>{line}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Select a Configuration</h3>
                <p className="text-muted-foreground text-center">
                  Choose an import configuration to view its execution history.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}