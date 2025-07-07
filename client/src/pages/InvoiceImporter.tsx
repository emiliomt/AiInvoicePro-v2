import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertTriangle, Calendar, Download, Eye, FileText, Play, Plus, Settings, Upload } from 'lucide-react';
import { useToast } from '../hooks/use-toast';

interface ImportConfig {
  id: number;
  name: string;
  erpConnection: string;
  fileTypes: string[];
  schedule: string;
  lastRun: string | null;
  nextRun: string | null;
  status: 'active' | 'paused' | 'error';
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

export default function InvoiceImporter() {
  const [configs, setConfigs] = useState<ImportConfig[]>([]);
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<ImportConfig | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('configurations');
  const { toast } = useToast();

  useEffect(() => {
    fetchConfigs();
    fetchLogs();
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
    try {
      const response = await fetch(`/api/invoice-importer/run/${configId}`, {
        method: 'POST'
      });

      if (response.ok) {
        toast({
          title: "Import Started",
          description: "Invoice import process has been initiated"
        });
        fetchLogs();
      } else {
        throw new Error('Failed to start import');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start import process",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">ERP Invoice Importer</h1>
          <p className="text-gray-600 mt-2">Automatically import invoices from your ERP systems on a scheduled basis</p>
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
                <FileText className="w-12 h-12 mx-auto text-gray-400 mb-4" />
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
                      <CardTitle>{config.name}</CardTitle>
                      <div>
                        <Button variant="outline" size="sm" onClick={() => handleRunNow(config.id)}>
                          <Play className="w-4 h-4 mr-2" />
                          Run Now
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p>ERP Connection: {config.erpConnection}</p>
                    <p>File Types: {config.fileTypes.join(', ')}</p>
                    <p>Schedule: {config.schedule}</p>
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
            <CardContent>
              <p>Schedule overview content goes here.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Import Configuration</DialogTitle>
          </DialogHeader>
          {/* Form for creating import configuration */}
        </DialogContent>
      </Dialog>
    </div>
  );
}