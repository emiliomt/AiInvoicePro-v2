import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Bot, Play, Clock, CheckCircle, XCircle, Eye, Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

// Form schema for ERP task
const erpTaskSchema = z.object({
  connectionId: z.coerce.number().min(1, 'Please select an ERP connection'),
  taskDescription: z.string().min(10, 'Task description must be at least 10 characters'),
});

type ERPTaskForm = z.infer<typeof erpTaskSchema>;

interface ERPConnection {
  id: number;
  name: string;
  baseUrl: string;
  username: string;
  description?: string;
  isActive: boolean;
  lastUsed?: string;
  createdAt: string;
  updatedAt: string;
}

interface ERPTask {
  id: number;
  userId: string;
  connectionId: number;
  taskDescription: string;
  generatedScript?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  result?: any;
  logs?: string;
  screenshots?: string[];
  executionTime?: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

interface ERPTask {
  id: number;
  connectionId: number;
  taskDescription: string;
  generatedScript?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  result?: any;
  logs?: string;
  screenshots?: string[];
  executionTime?: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export default function AIWorkflow() {
  const [selectedTask, setSelectedTask] = useState<ERPTask | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ERPTaskForm>({
    resolver: zodResolver(erpTaskSchema),
    defaultValues: {
      connectionId: 0,
      taskDescription: '',
    },
  });

  // Fetch ERP connections
  const { data: connections = [] } = useQuery<ERPConnection[]>({
    queryKey: ['/api/erp/connections'],
  });

  // Fetch ERP tasks
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<ERPTask[]>({
    queryKey: ['/api/erp/tasks'],
    refetchInterval: 5000, // Refresh every 5 seconds to show real-time progress
  });

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: (data: ERPTaskForm) => 
      apiRequest('POST', '/api/erp/tasks', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/tasks'] });
      form.reset();
      toast({
        title: 'Task Started',
        description: 'Your AI-powered automation task has been initiated.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create task',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: ERPTaskForm) => {
    createTaskMutation.mutate(data);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'processing':
        return <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleViewDetails = (task: ERPTask) => {
    setSelectedTask(task);
    setIsDetailsOpen(true);
  };

  const downloadScreenshot = (screenshot: string, index: number) => {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${screenshot}`;
    link.download = `screenshot-${index + 1}.png`;
    link.click();
  };

  const taskExamples = [
    "Upload invoice F123 for project MONTERIVERA",
    "Extract payment status from project dashboard",
    "Download all pending purchase orders from last week",
    "Update vendor information for supplier XYZ123",
    "Generate expense report for project ALPHA",
    "Check inventory levels for material code M001",
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">AI-Powered ERP Automation</h1>
        <p className="text-gray-600">
          Describe what you want to do in natural language, and our AI will create and execute automated workflows in your ERP system.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Task Creation Panel */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-blue-600" />
                Create Automation Task
              </CardTitle>
              <CardDescription>
                Tell our AI what you want to accomplish in your ERP system
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="connectionId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ERP Connection</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(Number(value))}
                          value={field.value?.toString() || ''}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select ERP connection" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {connections.map((connection: ERPConnection) => (
                              <SelectItem 
                                key={connection.id} 
                                value={connection.id.toString()}
                                disabled={!connection.isActive}
                              >
                                {connection.name} {!connection.isActive && '(Inactive)'}
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
                    name="taskDescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Task Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe what you want to do in your ERP system..."
                            className="min-h-[100px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={createTaskMutation.isPending || connections.length === 0}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    {createTaskMutation.isPending ? 'Creating Task...' : 'Start Automation'}
                  </Button>
                </form>
              </Form>

              {connections.length === 0 && (
                <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    No ERP connections available. Please add a connection first.
                  </p>
                </div>
              )}

              <div className="mt-6">
                <Label className="text-sm font-semibold text-gray-700">Example Tasks:</Label>
                <div className="mt-2 space-y-2">
                  {taskExamples.map((example, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => form.setValue('taskDescription', example)}
                      className="w-full text-left p-2 text-sm bg-gray-50 hover:bg-gray-100 rounded border text-gray-700 transition-colors"
                    >
                      "{example}"
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Task History Panel */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Automation History</CardTitle>
              <CardDescription>
                Track the progress and results of your AI-generated automation tasks
              </CardDescription>
            </CardHeader>
            <CardContent>
              {tasksLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                </div>
              ) : tasks.length === 0 ? (
                <div className="text-center py-8">
                  <Bot className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Tasks Yet</h3>
                  <p className="text-gray-600">
                    Create your first automation task to get started with AI-powered ERP workflows.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {tasks.map((task: ERPTask) => {
                    const connection = connections.find((c: ERPConnection) => c.id === task.connectionId);
                    return (
                      <div key={task.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(task.status)}
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(task.status)}`}>
                              {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                            </span>
                          </div>
                          <div className="text-sm text-gray-500">
                            {new Date(task.createdAt).toLocaleString()}
                          </div>
                        </div>
                        
                        <div className="mb-3">
                          <p className="font-medium text-gray-900 mb-1">
                            {task.taskDescription}
                          </p>
                          <p className="text-sm text-gray-600">
                            Connection: {connection?.name || 'Unknown'}
                          </p>
                        </div>

                        {task.executionTime && (
                          <div className="text-sm text-gray-600 mb-3">
                            Execution time: {(task.executionTime / 1000).toFixed(1)}s
                          </div>
                        )}

                        {task.errorMessage && (
                          <div className="bg-red-50 border border-red-200 rounded p-3 mb-3">
                            <p className="text-sm text-red-800">{task.errorMessage}</p>
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewDetails(task)}
                            className="flex items-center gap-1"
                          >
                            <Eye size={14} />
                            View Details
                          </Button>
                          {task.screenshots && task.screenshots.length > 0 && (
                            <Badge variant="secondary" className="flex items-center gap-1">
                              <Download size={12} />
                              {task.screenshots.length} Screenshots
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Task Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Task Details</DialogTitle>
            <DialogDescription>
              Detailed information about the automation task execution
            </DialogDescription>
          </DialogHeader>
          
          {selectedTask && (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="script">Generated Script</TabsTrigger>
                <TabsTrigger value="logs">Execution Logs</TabsTrigger>
                <TabsTrigger value="screenshots">Screenshots</TabsTrigger>
              </TabsList>
              
              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-semibold">Status</Label>
                    <div className="flex items-center gap-2 mt-1">
                      {getStatusIcon(selectedTask.status)}
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedTask.status)}`}>
                        {selectedTask.status}
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Execution Time</Label>
                    <p className="text-sm text-gray-600 mt-1">
                      {selectedTask.executionTime ? `${(selectedTask.executionTime / 1000).toFixed(1)}s` : 'N/A'}
                    </p>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-semibold">Task Description</Label>
                  <p className="text-sm text-gray-600 mt-1">{selectedTask.taskDescription}</p>
                </div>
                
                {selectedTask.result && Object.keys(selectedTask.result).length > 0 && (
                  <div>
                    <Label className="text-sm font-semibold">Extracted Data</Label>
                    <ScrollArea className="h-32 w-full border rounded p-3 mt-1">
                      <pre className="text-xs">{JSON.stringify(selectedTask.result, null, 2)}</pre>
                    </ScrollArea>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="script">
                <ScrollArea className="h-96 w-full border rounded p-4">
                  {selectedTask.generatedScript ? (
                    <pre className="text-xs">{JSON.stringify(JSON.parse(selectedTask.generatedScript), null, 2)}</pre>
                  ) : (
                    <p className="text-sm text-gray-500">No script generated yet</p>
                  )}
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="logs">
                <ScrollArea className="h-96 w-full border rounded p-4">
                  {selectedTask.logs ? (
                    <pre className="text-xs whitespace-pre-wrap">{selectedTask.logs}</pre>
                  ) : (
                    <p className="text-sm text-gray-500">No logs available</p>
                  )}
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="screenshots">
                {selectedTask.screenshots && selectedTask.screenshots.length > 0 ? (
                  <div className="space-y-4">
                    {selectedTask.screenshots.map((screenshot, index) => (
                      <div key={index} className="border rounded p-4">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-medium">Screenshot {index + 1}</h4>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => downloadScreenshot(screenshot, index)}
                          >
                            <Download size={14} className="mr-1" />
                            Download
                          </Button>
                        </div>
                        <img 
                          src={`data:image/png;base64,${screenshot}`}
                          alt={`Screenshot ${index + 1}`}
                          className="max-w-full h-auto border rounded"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No screenshots available</p>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}