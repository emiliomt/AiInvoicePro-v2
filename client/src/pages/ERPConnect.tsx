import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Edit, TestTube, Settings, Wifi, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import Header from "@/components/Header";

// Form schema for ERP connection
const erpConnectionSchema = z.object({
  name: z.string().min(1, 'Connection name is required'),
  baseUrl: z.string().url('Please enter a valid URL'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  description: z.string().optional(),
});

type ERPConnectionForm = z.infer<typeof erpConnectionSchema>;

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

interface ERPConnection {
  id: number;
  name: string;
  baseUrl: string;
  username: string;
  description?: string;
  isActive: boolean;
  lastUsed?: string;
  createdAt: string;
}

export default function ERPConnect() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<ERPConnection | null>(null);
  const [testingConnection, setTestingConnection] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ERPConnectionForm>({
    resolver: zodResolver(erpConnectionSchema),
    defaultValues: {
      name: '',
      baseUrl: '',
      username: '',
      password: '',
      description: '',
    },
  });

  // Fetch ERP connections
  const { data: connections = [], isLoading } = useQuery<ERPConnection[]>({
    queryKey: ['/api/erp/connections'],
  });

  // Create connection mutation
  const createConnectionMutation = useMutation({
    mutationFn: (data: ERPConnectionForm) => 
      apiRequest('POST', '/api/erp/connections', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/connections'] });
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: 'Connection Created',
        description: 'ERP connection has been created successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create connection',
        variant: 'destructive',
      });
    },
  });

  // Update connection mutation
  const updateConnectionMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ERPConnectionForm> }) =>
      apiRequest('PUT', `/api/erp/connections/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/connections'] });
      setIsDialogOpen(false);
      setEditingConnection(null);
      form.reset();
      toast({
        title: 'Connection Updated',
        description: 'ERP connection has been updated successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update connection',
        variant: 'destructive',
      });
    },
  });

  // Delete connection mutation
  const deleteConnectionMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest('DELETE', `/api/erp/connections/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/connections'] });
      toast({
        title: 'Connection Deleted',
        description: 'ERP connection has been deleted successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete connection',
        variant: 'destructive',
      });
    },
  });

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('POST', `/api/erp/connections/${id}/test`);
      return await response.json();
    },
    onSuccess: (data, id) => {
      setTestingConnection(null);
      queryClient.invalidateQueries({ queryKey: ['/api/erp/connections'] });

      const title = data.success ? 'Connection Test Successful' : 'Connection Test Failed';
      const description = data.message || (data.success 
        ? 'Successfully connected to the ERP system - Connection verified!' 
        : 'Unable to connect to the ERP system');

      toast({
        title,
        description,
        variant: data.success ? 'default' : 'destructive',
      });

      // Log additional details for debugging
      if (data.details) {
        console.log('Connection test details:', data.details);
      }
    },
    onError: (error: any) => {
      setTestingConnection(null);
      toast({
        title: 'Test Failed',
        description: error.message || 'Failed to test connection',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: ERPConnectionForm) => {
    if (editingConnection) {
      updateConnectionMutation.mutate({ id: editingConnection.id, data });
    } else {
      createConnectionMutation.mutate(data);
    }
  };

  const handleEdit = (connection: ERPConnection) => {
    setEditingConnection(connection);
    form.reset({
      name: connection.name,
      baseUrl: connection.baseUrl,
      username: connection.username,
      password: '', // Don't populate password for security
      description: connection.description || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this connection?')) {
      deleteConnectionMutation.mutate(id);
    }
  };

  const handleTest = (id: number) => {
    setTestingConnection(id);
    testConnectionMutation.mutate(id);
  };

  const handleAddNew = () => {
    setEditingConnection(null);
    form.reset();
    setIsDialogOpen(true);
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
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">ERP Connections</h1>
          <p className="text-gray-600 mt-2">
            Manage your ERP system connections for automated processing
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleAddNew} className="flex items-center gap-2">
              <Plus size={16} />
              Add Connection
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>
                {editingConnection ? 'Edit ERP Connection' : 'Add ERP Connection'}
              </DialogTitle>
              <DialogDescription>
                Enter the connection details for your ERP system. This information will be securely encrypted.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Connection Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Production SAP" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="baseUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ERP Base URL</FormLabel>
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
                    name="username"
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
                    name="password"
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
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Brief description of this connection..." 
                          className="resize-none"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
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
                    disabled={createConnectionMutation.isPending || updateConnectionMutation.isPending}
                  >
                    {editingConnection ? 'Update' : 'Create'} Connection
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {connections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Settings className="h-16 w-16 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No ERP Connections</h3>
            <p className="text-gray-600 text-center mb-4">
              Connect your ERP system to start automating tasks with AI-powered workflows.
            </p>
            <Button onClick={handleAddNew} className="flex items-center gap-2">
              <Plus size={16} />
              Add Your First Connection
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {connections.map((connection: ERPConnection) => (
            <Card key={connection.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Wifi className="h-5 w-5 text-blue-600" />
                    <CardTitle className="text-lg">{connection.name}</CardTitle>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant={connection.isActive ? "default" : "secondary"}>
                      {connection.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    {connection.lastUsed && (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Verified
                      </Badge>
                    )}
                  </div>
                </div>
                <CardDescription className="truncate max-w-[250px]" title={connection.baseUrl}>
                  {connection.baseUrl}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-gray-600">
                  <p><strong>Username:</strong> {connection.username}</p>
                  {connection.description && (
                    <p><strong>Description:</strong> {connection.description}</p>
                  )}
                  {connection.lastUsed && (
                    <p><strong>Last Verified:</strong> {new Date(connection.lastUsed).toLocaleDateString()}</p>
                  )}
                  {connection.lastUsed && (
                    <p className="text-green-600 font-medium flex items-center gap-1">
                      <CheckCircle className="w-4 h-4" />
                      Connection Verified
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleTest(connection.id)}
                    disabled={testingConnection === connection.id}
                    className="flex items-center gap-1"
                  >
                    <TestTube size={14} />
                    {testingConnection === connection.id ? 'Testing...' : 'Test'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(connection)}
                    className="flex items-center gap-1"
                  >
                    <Edit size={14} />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(connection.id)}
                    disabled={deleteConnectionMutation.isPending}
                    className="flex items-center gap-1 text-red-600 hover:text-red-700"
                  >
                    <Trash2 size={14} />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
          </main>
    </div>
  );
}