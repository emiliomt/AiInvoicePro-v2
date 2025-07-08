import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertTriangle, Calendar, Download, Eye, FileText, Play, Plus, Settings, Loader2 } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import Header from '@/components/Header';
import { ProgressTracker } from '../components/ProgressTracker';

interface ImportConfig {
  id: number;
  taskName: string;
  connectionId: number;
  fileTypes: string;
  scheduleType: string;
  lastRun: string | null;
  nextRun: string | null;
  isActive: boolean;
  connection?: {
    id: number;
    name: string;
    baseUrl: string;
    isActive: boolean;
  };
}

interface ImportLog {
  id: number;
  configId: number;
  timestamp: string;
  status: 'success' | 'error' | 'warning';
  message: string;
  documentsProcessed: number;
  errorsCount: number;
}

interface ERPConnection {
  id: number;
  name: string;
  baseUrl: string;
  isActive: boolean;
}

export default function InvoiceImporter() {
  const [configs, setConfigs] = useState<ImportConfig[]>([]);
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [erpConnections, setErpConnections] = useState<ERPConnection[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<ImportConfig | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('configurations');
  const [newConfig, setNewConfig] = useState({
    name: '',
    connectionId: '',
    fileTypes: 'pdf',
    schedule: 'once'
  });
  const [showProgressTracker, setShowProgressTracker] = useState(false);
  const [runningConfigId, setRunningConfigId] = useState<number | null>(null);
  const [runningConfigName, setRunningConfigName] = useState<string>('');
  const { toast } = useToast();

  useEffect(() => {
    fetchConfigs();
    fetchLogs();
    fetchERPConnections();
  }, []);

  const fetchConfigs = async () => {
    try {
      const response = await fetch('/api/invoice-importer/configs');
      if (response.ok) {
        const data = await response.json();
        setConfigs(data);
      }
    } catch (error) {
      console.error('Error fetching configs:', error);
    }
  };

  const fetchLogs = async () => {
    try {
      const response = await fetch('/api/invoice-importer/logs');
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  };

  const fetchERPConnections = async () => {
    try {
      const response = await fetch('/api/erp/connections');
      if (response.ok) {
        const data = await response.json();
        setErpConnections(data.filter((conn: ERPConnection) => conn.isActive));
      }
    } catch (error) {
      console.error('Error fetching ERP connections:', error);
    }
  };

  

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'paused': return 'bg-yellow-100 text-yellow-800';
      case 'error': return 'bg-red-100 text-red-800';
      case 'success': return 'bg-green-100 text-green-800';
      case 'warning': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleRunNow = async (configId: number) => {
    const config = configs.find(c => c.id === configId);
    if (!config) return;

    try {
      const response = await fetch(`/api/invoice-importer/configs/${configId}/execute`, {
        method: 'POST'
      });

      if (response.ok) {
        toast({
          title: "Import Started",
          description: "Invoice import process has been initiated"
        });
        
        // Show progress tracker
        setRunningConfigId(configId);
        setRunningConfigName(config.taskName);
        setShowProgressTracker(true);
        
        fetchLogs();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start import');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start import process",
        variant: "destructive"
      });
    }
  };

  const handleCreateConfig = async () => {
    if (!newConfig.name || !newConfig.connectionId) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await fetch('/api/invoice-importer/configs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          taskName: newConfig.name,
          connectionId: parseInt(newConfig.connectionId),
          fileTypes: newConfig.fileTypes,
          scheduleType: newConfig.schedule
        })
      });

      if (response.ok) {
        toast({
          title: "Configuration Created",
          description: "Import configuration created successfully"
        });
        setShowCreateDialog(false);
        setNewConfig({ name: '', connectionId: '', fileTypes: 'pdf', schedule: 'once' });
        fetchConfigs();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create configuration');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create configuration",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Invoice Importer</h1>
            <p className="text-gray-600 mt-2">Configure automated ERP invoice import processes</p>
          </div>
          <Button 
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create Import Configuration</span>
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="configurations">Configurations</TabsTrigger>
            <TabsTrigger value="logs">Import Logs</TabsTrigger>
            <TabsTrigger value="schedule">Schedule Overview</TabsTrigger>
          </TabsList>

          

          <TabsContent value="configurations" className="space-y-4">
            {configs.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <Settings className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600">No import configurations found</p>
                  <p className="text-sm text-gray-500 mt-2">Create your first configuration to start importing invoices automatically</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {configs.map((config) => (
                  <Card key={config.id}>
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <CardTitle>{config.taskName}</CardTitle>
                        <div>
                          <Button variant="outline" size="sm" onClick={() => handleRunNow(config.id)}>
                            <Play className="w-4 h-4 mr-2" />
                            Run Now
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p>ERP Connection: {config.connection?.name || `Connection ID: ${config.connectionId}`}</p>
                      <p>File Types: {config.fileTypes}</p>
                      <p>Schedule: {config.scheduleType}</p>
                      <div className="flex justify-between mt-4">
                        <p>Last Run: {config.lastRun || 'Never'}</p>
                        <p>Next Run: {config.nextRun || 'Not Scheduled'}</p>
                      </div>
                      <Badge className={getStatusColor(config.status)}>{config.status}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            {logs.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <FileText className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600">No import logs found</p>
                  <p className="text-sm text-gray-500 mt-2">Check back after running your configurations</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {logs.map((log) => (
                  <Card key={log.id}>
                    <CardHeader>
                      <CardTitle>Log ID: {log.id}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>Config ID: {log.configId}</p>
                      <p>Timestamp: {log.timestamp}</p>
                      <p>Message: {log.message}</p>
                      <p>Documents Processed: {log.documentsProcessed}</p>
                      <p>Errors Count: {log.errorsCount}</p>
                      <Badge className={getStatusColor(log.status)}>{log.status}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="schedule">
            <Card>
              <CardHeader>
                <CardTitle>Schedule Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">Scheduled import tasks will appear here when configured.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Import Configuration</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="config-name">Configuration Name</Label>
                <Input
                  id="config-name"
                  value={newConfig.name}
                  onChange={(e) => setNewConfig({ ...newConfig, name: e.target.value })}
                  placeholder="Enter configuration name"
                />
              </div>
              <div>
                <Label htmlFor="erp-connection">ERP Connection</Label>
                <Select
                  value={newConfig.connectionId}
                  onValueChange={(value) => setNewConfig({ ...newConfig, connectionId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select ERP connection" />
                  </SelectTrigger>
                  <SelectContent>
                    {erpConnections.map((connection) => (
                      <SelectItem key={connection.id} value={connection.id.toString()}>
                        {connection.name} ({connection.baseUrl})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="file-types">File Types</Label>
                <Select
                  value={newConfig.fileTypes}
                  onValueChange={(value) => setNewConfig({ ...newConfig, fileTypes: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">PDF only</SelectItem>
                    <SelectItem value="xml">XML only</SelectItem>
                    <SelectItem value="both">Both PDF and XML</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="schedule">Schedule</Label>
                <Select
                  value={newConfig.schedule}
                  onValueChange={(value) => setNewConfig({ ...newConfig, schedule: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">Manual</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="multiple_daily">Multiple Daily</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateConfig}>
                  Create Configuration
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Progress Tracker */}
        {runningConfigId && (
          <ProgressTracker
            isOpen={showProgressTracker}
            onClose={() => setShowProgressTracker(false)}
            configId={runningConfigId}
            configName={runningConfigName}
          />
        )}
      </div>
    </div>
    </div>
  );
}