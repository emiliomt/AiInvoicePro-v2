import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Play, 
  Pause, 
  Settings, 
  Database, 
  FileText, 
  ShoppingCart, 
  Activity, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Plus,
  Eye,
  Edit,
  Trash2,
  TestTube,
  Server
} from "lucide-react";

interface ErpConnection {
  id: number;
  connectionName: string;
  erpSystemType: string;
  status: string;
  lastConnected: string | null;
  lastError: string | null;
  isActive: boolean;
  createdAt: string;
}

interface RpaJob {
  id: number;
  jobName: string;
  documentType: string;
  status: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  documentsExtracted: number;
  errorCount: number;
  isActive: boolean;
  erpConnectionId: number;
  stats: {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    totalDocumentsProcessed: number;
  };
}

interface RpaStats {
  totalConnections: number;
  activeConnections: number;
  totalJobs: number;
  activeJobs: number;
  totalDocumentsExtracted: number;
  recentExecutions: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
  };
}

export default function RPADashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<ErpConnection | null>(null);
  const [selectedJob, setSelectedJob] = useState<RpaJob | null>(null);

  // Fetch RPA stats
  const { data: stats } = useQuery<RpaStats>({
    queryKey: ["/api/rpa/dashboard/stats"]
  });

  // Fetch ERP connections
  const { data: connections, isLoading: connectionsLoading } = useQuery<ErpConnection[]>({
    queryKey: ["/api/rpa/connections"]
  });

  // Fetch RPA jobs
  const { data: jobs, isLoading: jobsLoading } = useQuery<RpaJob[]>({
    queryKey: ["/api/rpa/jobs"]
  });

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: (connectionId: number) => 
      apiRequest(`/api/rpa/connections/${connectionId}/test`, {
        method: "POST"
      }),
    onSuccess: (data, connectionId) => {
      toast({
        title: data.success ? "Connection Test Successful" : "Connection Test Failed",
        description: data.error || "Connection is working properly",
        variant: data.success ? "default" : "destructive"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/rpa/connections"] });
    },
    onError: (error: any) => {
      toast({
        title: "Test Failed",
        description: error.message || "Failed to test connection",
        variant: "destructive"
      });
    }
  });

  // Execute job mutation
  const executeJobMutation = useMutation({
    mutationFn: (jobId: number) => 
      apiRequest(`/api/rpa/jobs/${jobId}/execute`, {
        method: "POST"
      }),
    onSuccess: (data) => {
      toast({
        title: "Job Execution Started",
        description: `Execution ID: ${data.executionId}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/rpa/jobs"] });
    },
    onError: (error: any) => {
      toast({
        title: "Execution Failed",
        description: error.message || "Failed to start job execution",
        variant: "destructive"
      });
    }
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'completed': return 'bg-green-500';
      case 'running': return 'bg-blue-500';
      case 'pending': return 'bg-yellow-500';
      case 'failed': return 'bg-red-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getSystemIcon = (systemType: string) => {
    switch (systemType) {
      case 'custom_api': return <Server className="h-4 w-4" />;
      case 'database': return <Database className="h-4 w-4" />;
      case 'sftp': return <FileText className="h-4 w-4" />;
      default: return <Settings className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">RPA Agent Dashboard</h1>
          <p className="text-muted-foreground">
            Automated document extraction from ERP systems
          </p>
        </div>
        <div className="flex space-x-2">
          <Dialog open={connectionDialogOpen} onOpenChange={setConnectionDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Connection
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create ERP Connection</DialogTitle>
                <DialogDescription>
                  Connect to your ERP system to enable automated document extraction
                </DialogDescription>
              </DialogHeader>
              <ERPConnectionForm onSuccess={() => setConnectionDialogOpen(false)} />
            </DialogContent>
          </Dialog>
          
          <Dialog open={jobDialogOpen} onOpenChange={setJobDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Job
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Extraction Job</DialogTitle>
                <DialogDescription>
                  Set up automated document extraction from your ERP system
                </DialogDescription>
              </DialogHeader>
              <ExtractionJobForm connections={connections || []} onSuccess={() => setJobDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Connections</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalConnections || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.activeConnections || 0} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeJobs || 0}</div>
            <p className="text-xs text-muted-foreground">
              of {stats?.totalJobs || 0} total jobs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Documents Extracted</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalDocumentsExtracted || 0}</div>
            <p className="text-xs text-muted-foreground">
              Total processed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.recentExecutions.successRate?.toFixed(1) || 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.recentExecutions.successful || 0} of {stats?.recentExecutions.total || 0} executions
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="connections" className="space-y-4">
        <TabsList>
          <TabsTrigger value="connections">ERP Connections</TabsTrigger>
          <TabsTrigger value="jobs">Extraction Jobs</TabsTrigger>
          <TabsTrigger value="executions">Recent Executions</TabsTrigger>
        </TabsList>

        <TabsContent value="connections" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>ERP Connections</CardTitle>
              <CardDescription>
                Manage connections to your ERP systems for automated document extraction
              </CardDescription>
            </CardHeader>
            <CardContent>
              {connectionsLoading ? (
                <div>Loading connections...</div>
              ) : connections?.length === 0 ? (
                <div className="text-center py-8">
                  <Database className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-4 text-lg font-medium">No ERP connections</h3>
                  <p className="mt-2 text-sm text-gray-500">
                    Create your first ERP connection to start automated document extraction
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {connections?.map((connection) => (
                    <div key={connection.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          {getSystemIcon(connection.erpSystemType)}
                          <div>
                            <p className="font-medium">{connection.connectionName}</p>
                            <p className="text-sm text-gray-500 capitalize">
                              {connection.erpSystemType.replace('_', ' ')}
                            </p>
                          </div>
                        </div>
                        <Badge className={getStatusColor(connection.status)}>
                          {connection.status}
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => testConnectionMutation.mutate(connection.id)}
                          disabled={testConnectionMutation.isPending}
                        >
                          <TestTube className="h-4 w-4 mr-1" />
                          Test
                        </Button>
                        <Button variant="outline" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Extraction Jobs</CardTitle>
              <CardDescription>
                Automated jobs that extract invoices and purchase orders from your ERP systems
              </CardDescription>
            </CardHeader>
            <CardContent>
              {jobsLoading ? (
                <div>Loading jobs...</div>
              ) : jobs?.length === 0 ? (
                <div className="text-center py-8">
                  <Activity className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-4 text-lg font-medium">No extraction jobs</h3>
                  <p className="mt-2 text-sm text-gray-500">
                    Create your first extraction job to automate document processing
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {jobs?.map((job) => (
                    <div key={job.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          {job.documentType === 'invoice' ? (
                            <FileText className="h-4 w-4" />
                          ) : (
                            <ShoppingCart className="h-4 w-4" />
                          )}
                          <div>
                            <p className="font-medium">{job.jobName}</p>
                            <p className="text-sm text-gray-500 capitalize">
                              {job.documentType.replace('_', ' ')} extraction
                            </p>
                          </div>
                        </div>
                        <Badge className={getStatusColor(job.status)}>
                          {job.status}
                        </Badge>
                        <div className="text-sm text-gray-500">
                          <p>{job.documentsExtracted} docs extracted</p>
                          <p>{job.stats.totalExecutions} executions</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => executeJobMutation.mutate(job.id)}
                          disabled={executeJobMutation.isPending || job.status === 'running'}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Run Now
                        </Button>
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="executions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Executions</CardTitle>
              <CardDescription>
                History and status of recent document extraction executions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Clock className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-4 text-lg font-medium">No recent executions</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Execution history will appear here once jobs start running
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ERP Connection Form Component
function ERPConnectionForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    connectionName: '',
    erpSystemType: '',
    connectionConfig: {}
  });

  const createConnectionMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/rpa/connections', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      toast({
        title: "Connection Created",
        description: "ERP connection has been created successfully"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/rpa/connections"] });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create connection",
        variant: "destructive"
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createConnectionMutation.mutate(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="connectionName">Connection Name</Label>
        <Input
          id="connectionName"
          value={formData.connectionName}
          onChange={(e) => setFormData(prev => ({ ...prev, connectionName: e.target.value }))}
          placeholder="My ERP System"
          required
        />
      </div>

      <div>
        <Label htmlFor="erpSystemType">ERP System Type</Label>
        <Select
          value={formData.erpSystemType}
          onValueChange={(value) => setFormData(prev => ({ ...prev, erpSystemType: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select ERP system type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="custom_api">Custom API</SelectItem>
            <SelectItem value="database">Database</SelectItem>
            <SelectItem value="sftp">SFTP</SelectItem>
            <SelectItem value="sharepoint">SharePoint</SelectItem>
            <SelectItem value="sap">SAP</SelectItem>
            <SelectItem value="oracle">Oracle</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="pt-4 flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onSuccess}>
          Cancel
        </Button>
        <Button type="submit" disabled={createConnectionMutation.isPending}>
          Create Connection
        </Button>
      </div>
    </form>
  );
}

// Extraction Job Form Component
function ExtractionJobForm({ connections, onSuccess }: { connections: ErpConnection[], onSuccess: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    jobName: '',
    documentType: 'invoice',
    erpConnectionId: '',
    extractionCriteria: {
      dateFrom: '',
      dateTo: '',
      filters: {}
    },
    scheduleConfig: {
      enabled: false,
      frequency: 'daily',
      interval: 1
    }
  });

  const createJobMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/rpa/jobs', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      toast({
        title: "Job Created",
        description: "Extraction job has been created successfully"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/rpa/jobs"] });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create job",
        variant: "destructive"
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createJobMutation.mutate({
      ...formData,
      erpConnectionId: parseInt(formData.erpConnectionId)
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="jobName">Job Name</Label>
        <Input
          id="jobName"
          value={formData.jobName}
          onChange={(e) => setFormData(prev => ({ ...prev, jobName: e.target.value }))}
          placeholder="Daily Invoice Extraction"
          required
        />
      </div>

      <div>
        <Label htmlFor="documentType">Document Type</Label>
        <Select
          value={formData.documentType}
          onValueChange={(value) => setFormData(prev => ({ ...prev, documentType: value }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="invoice">Invoices</SelectItem>
            <SelectItem value="purchase_order">Purchase Orders</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="erpConnectionId">ERP Connection</Label>
        <Select
          value={formData.erpConnectionId}
          onValueChange={(value) => setFormData(prev => ({ ...prev, erpConnectionId: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select connection" />
          </SelectTrigger>
          <SelectContent>
            {connections.map((conn) => (
              <SelectItem key={conn.id} value={conn.id.toString()}>
                {conn.connectionName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="pt-4 flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onSuccess}>
          Cancel
        </Button>
        <Button type="submit" disabled={createJobMutation.isPending}>
          Create Job
        </Button>
      </div>
    </form>
  );
}