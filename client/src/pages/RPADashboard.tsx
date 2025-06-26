
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Bot, Play, Settings, Activity, Plus, Wifi } from 'lucide-react';
import Header from '@/components/Header';

interface ERPConnection {
  id: string;
  name: string;
  baseUrl: string;
  username: string;
  status: 'connected' | 'disconnected' | 'error';
  lastUsed?: Date;
}

interface RPATask {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  connectionId: string;
  createdAt: Date;
  completedAt?: Date;
  logs?: string[];
  result?: any;
}

export default function RPADashboard() {
  const { toast } = useToast();
  const [selectedConnection, setSelectedConnection] = useState<string>('');
  const [taskDescription, setTaskDescription] = useState('');
  const [isRunning, setIsRunning] = useState(false);

  // Mock data for demonstration
  const [connections] = useState<ERPConnection[]>([
    {
      id: '1',
      name: 'SINCO',
      baseUrl: 'https://pruebas3.sincorp.com/SincoDycon_Nueva_PRINT/V3/Marco/Default',
      username: 'ecaronr',
      status: 'connected',
      lastUsed: new Date()
    }
  ]);

  const [tasks] = useState<RPATask[]>([
    {
      id: '1',
      description: 'Upload invoice F123 for project MONTERIVERA',
      status: 'completed',
      connectionId: '1',
      createdAt: new Date(Date.now() - 3600000),
      completedAt: new Date(Date.now() - 3000000),
      logs: ['Login successful', 'Navigated to invoice upload', 'File uploaded successfully'],
      result: { success: true, invoiceId: 'F123' }
    }
  ]);

  const handleRunTask = async () => {
    if (!selectedConnection || !taskDescription.trim()) {
      toast({
        title: "Missing Information",
        description: "Please select a connection and enter a task description.",
        variant: "destructive"
      });
      return;
    }

    setIsRunning(true);
    
    try {
      // Simulate API call to run RPA task
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      toast({
        title: "Task Started",
        description: "Your RPA task has been initiated successfully.",
      });
    } catch (error) {
      toast({
        title: "Task Failed",
        description: "Failed to start the RPA task. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsRunning(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'bg-green-100 text-green-800';
      case 'disconnected': return 'bg-gray-100 text-gray-800';
      case 'error': return 'bg-red-100 text-red-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'running': return 'bg-blue-100 text-blue-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Bot className="w-8 h-8 text-blue-600" />
            RPA Automation Platform
          </h1>
          <p className="mt-2 text-gray-600">
            Automate your ERP tasks using AI-powered descriptions
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Task Runner */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Play className="w-5 h-5" />
                  Create RPA Task
                </CardTitle>
                <CardDescription>
                  Describe what you want to automate in natural language
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Select ERP Connection
                  </label>
                  <select
                    value={selectedConnection}
                    onChange={(e) => setSelectedConnection(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Choose a connection...</option>
                    {connections.map((conn) => (
                      <option key={conn.id} value={conn.id}>
                        {conn.name} ({conn.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Task Description
                  </label>
                  <textarea
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    placeholder="e.g., Upload invoice F123 for project MONTERIVERA"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none"
                  />
                </div>

                <Button 
                  onClick={handleRunTask}
                  disabled={isRunning || !selectedConnection || !taskDescription.trim()}
                  className="w-full"
                >
                  {isRunning ? (
                    <>
                      <Activity className="w-4 h-4 mr-2 animate-spin" />
                      Running Task...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Run Task
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Recent Tasks */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Recent Tasks</CardTitle>
                <CardDescription>Your latest RPA automation tasks</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {tasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{task.description}</p>
                        <p className="text-sm text-gray-500">
                          {task.createdAt.toLocaleString()}
                        </p>
                      </div>
                      <Badge className={getStatusColor(task.status)}>
                        {task.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* ERP Connections */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wifi className="w-5 h-5" />
                  ERP Connections
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {connections.map((conn) => (
                    <div key={conn.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{conn.name}</p>
                        <p className="text-sm text-gray-500">{conn.username}</p>
                      </div>
                      <Badge className={getStatusColor(conn.status)}>
                        {conn.status}
                      </Badge>
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="w-full mt-3">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Connection
                </Button>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Stats</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-600">1</p>
                    <p className="text-sm text-gray-500">Active Connections</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-600">1</p>
                    <p className="text-sm text-gray-500">Completed Tasks</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
