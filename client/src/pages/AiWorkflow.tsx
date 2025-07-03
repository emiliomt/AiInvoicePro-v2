import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ProgressTracker } from '@/components/ProgressTracker';
import { Bot, Play, Clock, CheckCircle, XCircle, Eye, Download, Trash2, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface ERPConnection {
  id: number;
  name: string;
  baseUrl: string;
  username: string;
  status: 'active' | 'inactive';
  lastUsed: Date | null;
}

interface ERPTask {
  id: number;
  connectionId: number;
  taskDescription: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: any;
  logs?: string;
  screenshots?: string[];
  executionTime?: number;
  errorMessage?: string;
  createdAt: Date;
}

export default function AiWorkflow() {
  const [selectedConnection, setSelectedConnection] = useState<number | null>(null);
  const [taskDescription, setTaskDescription] = useState('');
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [activeTab, setActiveTab] = useState<'create' | 'scheduled'>('create');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState<ERPTask | null>(null);

  // Fetch ERP connections
  const { data: connections = [], isLoading: connectionsLoading } = useQuery<ERPConnection[]>({
    queryKey: ['/api/erp/connections'],
  });

  // Fetch ERP tasks
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<ERPTask[]>({
    queryKey: ['/api/erp/tasks'],
  });

  // Fetch current user
  const { data: user } = useQuery<{ id: string; email: string }>({
    queryKey: ['/api/user'],
  });

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async (data: { connectionId: number; taskDescription: string }) => {
      try {
        console.log('Creating task with data:', data);
        const response = await fetch('/api/erp/tasks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || errorData.message || 'Failed to create task');
        }

        return await response.json();
      } catch (error) {
        console.error('Task creation error:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('Task created successfully:', data);
      setActiveTaskId(data.id);
      setShowProgress(true);
      queryClient.invalidateQueries({ queryKey: ['/api/erp/tasks'] });
      toast({
        title: "Task Started",
        description: "Your automation task has been started",
      });
    },
    onError: (error: any) => {
      console.error('Create task mutation error:', error);
      toast({
        title: "Task Failed",
        description: error.message || "Failed to create automation task",
        variant: "destructive",
      });
    },
  });

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      try {
        const response = await fetch(`/api/erp/tasks/${taskId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || errorData.message || 'Failed to delete task');
        }
        return await response.json();
      } catch (error) {
        console.error('Task deletion error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/tasks'] });
      toast({
        title: "Task Deleted",
        description: "Task has been deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete task",
        variant: "destructive",
      });
    },
  });

  // Save workflow mutation
  const saveWorkflowMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; connectionId: number }) => {
      return await apiRequest('/api/workflows', 'POST', data);
    },
    onSuccess: () => {
      setTaskDescription('');
      toast({
        title: "Workflow Saved",
        description: "Your automation workflow has been saved successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save workflow",
        variant: "destructive",
      });
    },
  });

  const handleCreateTask = () => {
    if (!selectedConnection || !taskDescription.trim()) {
      toast({
        title: "Missing Information",
        description: "Please select a connection and provide a task description",
        variant: "destructive",
      });
      return;
    }

    createTaskMutation.mutate({
      connectionId: selectedConnection,
      taskDescription: taskDescription.trim(),
    });
  };

  const handleSaveWorkflow = () => {
    if (!selectedConnection || !taskDescription.trim()) {
      toast({
        title: "Missing Information",
        description: "Please select a connection and enter a task description",
        variant: "destructive",
      });
      return;
    }

    try {
      const workflowName = `Workflow ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
      console.log('Saving workflow with data:', {
        name: workflowName,
        description: taskDescription,
        connectionId: selectedConnection,
      });

      saveWorkflowMutation.mutate({
        name: workflowName,
        description: taskDescription,
        connectionId: selectedConnection,
      });
    } catch (error) {
      console.error('Error in handleSaveWorkflow:', error);
      toast({
        title: "Save Failed",
        description: "An error occurred while preparing to save the workflow",
        variant: "destructive",
      });
    }
  };

  const handleProgressComplete = (data: any) => {
    setShowProgress(false);
    setActiveTaskId(null);
    queryClient.invalidateQueries({ queryKey: ['/api/erp/tasks'] });
    toast({
      title: "Task Completed",
      description: "ERP automation task completed successfully",
    });
  };

  const handleProgressError = (error: any) => {
    setShowProgress(false);
    setActiveTaskId(null);
    queryClient.invalidateQueries({ queryKey: ['/api/erp/tasks'] });
    toast({
      title: "Task Failed",
      description: error?.message || "ERP automation task failed",
      variant: "destructive",
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processing':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI-Powered ERP Automation</h1>
          <p className="text-gray-600 mt-2">
            Describe what you want to do in natural language, and our AI will create and execute automated workflows in your ERP system.
          </p>
        </div>
        <Bot className="h-12 w-12 text-blue-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create New Task */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create Automation Task
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="connection">ERP Connection</Label>
              <Select 
                value={selectedConnection?.toString() || ""} 
                onValueChange={(value) => setSelectedConnection(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an ERP connection" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((connection) => (
                    <SelectItem key={connection.id} value={connection.id.toString()}>
                      {connection.name} - {connection.baseUrl}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="taskDescription">Task Description</Label>
              <Textarea
                id="taskDescription"
                placeholder="Describe what you want to do in your ERP system in natural language..."
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">Example Tasks:</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• "Log into SINCO ERP. Click the 'FE' module in the left sidebar. Wait 2 seconds for it to expand. Then click on 'Documentos recibidos' from the submenu. Once the document table loads, loop through each row. In each row, click the document number link in the second column. When the document detail page opens, download all XML files shown as icons under the document number. After downloading, return to the main list and continue with the next row."</li>
                <li>• "Extract payment status from project dashboard"</li>
                <li>• "Download all pending purchase orders from last week"</li>
                <li>• "Update vendor information for supplier XYZ123"</li>
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button 
                onClick={handleCreateTask}
                disabled={createTaskMutation.isPending || !selectedConnection || !taskDescription.trim()}
              >
                <Play className="h-4 w-4 mr-2" />
                {createTaskMutation.isPending ? 'Starting...' : 'Start Automation'}
              </Button>
              <Button 
                variant="outline"
                onClick={handleSaveWorkflow}
                disabled={saveWorkflowMutation.isPending || !selectedConnection || !taskDescription.trim()}
              >
                {saveWorkflowMutation.isPending ? 'Saving...' : 'Save Task'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Real-time Progress */}
        {showProgress && activeTaskId && user && (
          <Card>
            <CardHeader>
              <CardTitle>Task Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <ProgressTracker
                userId={user?.id || ''}
                taskId={activeTaskId}
                onComplete={handleProgressComplete}
                onError={handleProgressError}
              />
            </CardContent>
          </Card>
        )}

        {/* Task History */}
        {!showProgress && (
          <Card>
            <CardHeader>
              <CardTitle>Automation History</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <div className="space-y-3">
                  {tasks.map((task) => (
                    <div key={task.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(task.status)}
                          <Badge className={getStatusColor(task.status)}>
                            {task.status.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          {task.screenshots && task.screenshots.length > 0 && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                toast({
                                  title: "Screenshots",
                                  description: `Task has ${task.screenshots?.length} screenshots available`,
                                });
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          {task.result && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                toast({
                                  title: "Download Results",
                                  description: "Task results are available for download",
                                });
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => deleteTaskMutation.mutate(task.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium text-sm">Task Description</h4>
                        <p className="text-sm text-gray-600 mt-1">{task.taskDescription}</p>
                      </div>

                      {task.errorMessage && (
                        <div className="bg-red-50 p-3 rounded">
                          <p className="text-sm text-red-800">{task.errorMessage}</p>
                        </div>
                      )}

                      {task.executionTime && (
                        <div className="text-xs text-gray-500">
                          Execution time: {Math.round(task.executionTime / 1000)}s
                        </div>
                      )}

                      <div className="text-xs text-gray-500">
                        Created: {new Date(task.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))}

                  {tasks.length === 0 && (
                    <div className="text-center text-gray-500 py-8">
                      No automation tasks yet. Create your first task above.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
       {selectedTask && (
          <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Task Details</DialogTitle>
                <DialogDescription>
                  Task #{selectedTask.id} - {selectedTask.status}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Description</h4>
                  <p className="text-sm text-gray-600">{selectedTask.taskDescription}</p>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Execution Details</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Status:</span> {selectedTask.status}
                    </div>
                    <div>
                      <span className="font-medium">Created:</span> {new Date(selectedTask.createdAt).toLocaleString()}
                    </div>
                    {selectedTask.executionTime && (
                      <div>
                        <span className="font-medium">Duration:</span> {Math.round(selectedTask.executionTime / 1000)}s
                      </div>
                    )}
                  </div>
                </div>

                {selectedTask.screenshots && selectedTask.screenshots.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Screenshots ({selectedTask.screenshots.length})</h4>
                    <div className="grid grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                      {selectedTask.screenshots.map((screenshot, index) => (
                        <div key={index} className="border rounded-lg overflow-hidden">
                          <div className="bg-gray-100 px-3 py-1 text-xs font-medium">
                            Screenshot {index + 1}
                          </div>
                          <img
                            src={`data:image/png;base64,${screenshot}`}
                            alt={`Screenshot ${index + 1}`}
                            className="w-full h-auto cursor-pointer hover:opacity-80"
                            onClick={() => window.open(`data:image/png;base64,${screenshot}`, '_blank')}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTask.logs && (
                  <div>
                    <h4 className="font-medium mb-2">Execution Logs</h4>
                    <div className="bg-gray-50 p-3 rounded-md max-h-40 overflow-y-auto">
                      <pre className="text-xs whitespace-pre-wrap">{selectedTask.logs}</pre>
                    </div>
                  </div>
                )}

                {selectedTask.errorMessage && (
                  <div>
                    <h4 className="font-medium mb-2 text-red-600">Error Message</h4>
                    <div className="bg-red-50 p-3 rounded-md">
                      <p className="text-sm text-red-800">{selectedTask.errorMessage}</p>
                    </div>
                  </div>
                )}

                {selectedTask.result && Object.keys(selectedTask.result).length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Extracted Data</h4>
                    <div className="bg-green-50 p-3 rounded-md">
                      <pre className="text-xs whitespace-pre-wrap">
                        {JSON.stringify(selectedTask.result, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
    </div>
  );
}