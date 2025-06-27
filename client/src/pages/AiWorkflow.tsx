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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch ERP connections
  const { data: connections = [], isLoading: connectionsLoading } = useQuery<ERPConnection[]>({
    queryKey: ['/api/erp/connections'],
  });

  // Fetch ERP tasks
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<ERPTask[]>({
    queryKey: ['/api/erp/tasks'],
  });

  // Fetch current user
  const { data: user } = useQuery({
    queryKey: ['/api/user'],
  });

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async (data: { connectionId: number; taskDescription: string }) => {
      return await apiRequest('/api/erp/tasks', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (task) => {
      setActiveTaskId(task.id);
      setShowProgress(true);
      setTaskDescription('');
      queryClient.invalidateQueries({ queryKey: ['/api/erp/tasks'] });
      toast({
        title: "Task Started",
        description: "ERP automation task has been started successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Task Failed",
        description: error.message || "Failed to start ERP automation task",
        variant: "destructive",
      });
    },
  });

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      return await apiRequest(`/api/erp/tasks/${taskId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/tasks'] });
      toast({
        title: "Task Deleted",
        description: "Task has been deleted successfully",
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

            <Button 
              onClick={handleCreateTask}
              disabled={createTaskMutation.isPending || !selectedConnection || !taskDescription.trim()}
              className="w-full"
            >
              <Play className="h-4 w-4 mr-2" />
              {createTaskMutation.isPending ? 'Starting Task...' : 'Start Automation'}
            </Button>
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
                userId={user.id}
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
                            <Button size="sm" variant="outline">
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          {task.result && (
                            <Button size="sm" variant="outline">
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
    </div>
  );
}