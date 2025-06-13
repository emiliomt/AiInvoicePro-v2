import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  FileText, 
  DollarSign, 
  Calendar, 
  Building, 
  MapPin, 
  Target, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Brain,
  Settings,
  Search,
  Plus
} from "lucide-react";

interface Invoice {
  id: number;
  fileName: string;
  vendorName?: string;
  totalAmount?: string;
  currency?: string;
  invoiceDate?: string;
  matchStatus?: string;
  matchScore?: string;
  matchedProjectId?: string;
  isPettyCash?: boolean;
  pettyCashChecked?: boolean;
  extractedData?: any;
}

interface Project {
  id: number;
  projectId: string;
  name: string;
  description?: string;
  address?: string;
  city?: string;
  budget?: string;
  currency?: string;
  status?: string;
}

interface ProjectMatchResult {
  project: Project;
  matchScore: number;
  matchReason: string;
  matchDetails: {
    projectNameMatch?: number;
    addressMatch?: number;
    taxIdMatch?: number;
    cityMatch?: number;
    overallConfidence: number;
  };
}

interface MatchingSettings {
  pettyCashThreshold: number;
  autoMatchThreshold: number;
}

export default function ProjectMatching() {
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [matches, setMatches] = useState<ProjectMatchResult[]>([]);
  const [processing, setProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<MatchingSettings>({
    pettyCashThreshold: 100,
    autoMatchThreshold: 85
  });
  const [projectSearch, setProjectSearch] = useState("");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch pending invoices for project matching
  const { data: pendingInvoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['/api/project-matching/pending'],
  });

  // Fetch all projects for manual selection
  const { data: allProjects = [] } = useQuery({
    queryKey: ['/api/projects'],
  });

  // Fetch matching settings
  const { data: matchingSettings } = useQuery({
    queryKey: ['/api/project-matching/settings'],
  });

  // Update settings when data changes
  useEffect(() => {
    if (matchingSettings) {
      setSettings(matchingSettings as MatchingSettings);
    }
  }, [matchingSettings]);

  // Process invoice mutation
  const processInvoiceMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const response = await fetch(`/api/project-matching/${invoiceId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('Failed to process invoice');
      return response.json();
    },
    onSuccess: (data) => {
      setMatches(data.matches || []);
      queryClient.invalidateQueries({ queryKey: ['/api/project-matching/pending'] });
      
      if (data.isPettyCash) {
        toast({
          title: "Petty Cash Invoice",
          description: data.pettyCashResult.reason
        });
      } else if (data.autoAssigned) {
        toast({
          title: "Auto-Assigned",
          description: data.autoAssignResult.reason
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Processing Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Manual assignment mutation
  const assignProjectMutation = useMutation({
    mutationFn: async ({ invoiceId, projectId, matchScore }: { 
      invoiceId: number; 
      projectId: string; 
      matchScore?: number 
    }) => {
      const response = await fetch(`/api/project-matching/${invoiceId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, matchScore })
      });
      if (!response.ok) throw new Error('Failed to assign project');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Project Assigned",
        description: "Invoice has been assigned to the selected project"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/project-matching/pending'] });
      setSelectedInvoice(null);
      setMatches([]);
    }
  });

  // No match mutation
  const markNoMatchMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const response = await fetch(`/api/project-matching/${invoiceId}/no-match`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to mark as no match');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Marked as No Match",
        description: "Invoice marked as having no project match"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/project-matching/pending'] });
      setSelectedInvoice(null);
      setMatches([]);
    }
  });

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: MatchingSettings) => {
      const response = await fetch('/api/project-matching/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      if (!response.ok) throw new Error('Failed to update settings');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Settings Updated",
        description: "Project matching settings have been updated"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/project-matching/settings'] });
      setShowSettings(false);
    }
  });

  const handleProcessInvoice = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setProcessing(true);
    try {
      await processInvoiceMutation.mutateAsync(invoice.id);
    } finally {
      setProcessing(false);
    }
  };

  const handleAssignProject = (projectId: string, matchScore?: number) => {
    if (selectedInvoice) {
      assignProjectMutation.mutate({
        invoiceId: selectedInvoice.id,
        projectId,
        matchScore
      });
    }
  };

  const handleMarkNoMatch = () => {
    if (selectedInvoice) {
      markNoMatchMutation.mutate(selectedInvoice.id);
    }
  };

  const formatAmount = (amount?: string, currency?: string) => {
    if (!amount) return "N/A";
    const numAmount = parseFloat(amount);
    return `${currency || 'USD'} ${numAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'auto_matched':
        return <Badge variant="default" className="bg-green-100 text-green-800">Auto Matched</Badge>;
      case 'manual_match':
        return <Badge variant="default" className="bg-blue-100 text-blue-800">Manual Match</Badge>;
      case 'no_match':
        return <Badge variant="secondary">No Match</Badge>;
      case 'pending_review':
      default:
        return <Badge variant="outline">Pending Review</Badge>;
    }
  };

  const filteredProjects = (allProjects as Project[]).filter((project: Project) =>
    project.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
    project.projectId.toLowerCase().includes(projectSearch.toLowerCase()) ||
    (project.description && project.description.toLowerCase().includes(projectSearch.toLowerCase()))
  );

  if (loadingInvoices) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading invoices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">AI Project Matching</h1>
          <p className="text-gray-600 mt-1">
            Intelligent invoice-to-project assignment with petty cash filtering
          </p>
        </div>
        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings size={16} className="mr-2" />
              Settings
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Project Matching Settings</DialogTitle>
              <DialogDescription>
                Configure thresholds for petty cash and auto-assignment
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="pettyCashThreshold">Petty Cash Threshold</Label>
                <Input
                  id="pettyCashThreshold"
                  type="number"
                  value={settings.pettyCashThreshold}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    pettyCashThreshold: parseFloat(e.target.value) || 0
                  }))}
                  placeholder="100"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Invoices below this amount will be classified as petty cash
                </p>
              </div>
              <div>
                <Label htmlFor="autoMatchThreshold">Auto-Match Threshold (%)</Label>
                <Input
                  id="autoMatchThreshold"
                  type="number"
                  min="0"
                  max="100"
                  value={settings.autoMatchThreshold}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    autoMatchThreshold: parseFloat(e.target.value) || 0
                  }))}
                  placeholder="85"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Projects with confidence above this will be auto-assigned
                </p>
              </div>
              <div className="flex justify-end space-x-2 pt-4">
                <Button variant="outline" onClick={() => setShowSettings(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => updateSettingsMutation.mutate(settings)}
                  disabled={updateSettingsMutation.isPending}
                >
                  Save Settings
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel - Invoice List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText size={20} className="mr-2" />
              Pending Invoices
              <Badge variant="secondary" className="ml-2">
                {(pendingInvoices as Invoice[]).length}
              </Badge>
            </CardTitle>
            <CardDescription>
              Invoices waiting for project assignment
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(pendingInvoices as Invoice[]).length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
                <p className="text-gray-600">All invoices have been processed!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(pendingInvoices as Invoice[]).map((invoice: Invoice) => (
                  <div
                    key={invoice.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedInvoice?.id === invoice.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedInvoice(invoice)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center">
                        <FileText size={16} className="mr-2 text-gray-400" />
                        <span className="font-medium text-sm truncate">
                          {invoice.fileName}
                        </span>
                      </div>
                      {getStatusBadge(invoice.matchStatus)}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                      <div className="flex items-center">
                        <Building size={12} className="mr-1" />
                        {invoice.vendorName || "Unknown Vendor"}
                      </div>
                      <div className="flex items-center">
                        <DollarSign size={12} className="mr-1" />
                        {formatAmount(invoice.totalAmount, invoice.currency)}
                      </div>
                    </div>

                    {invoice.isPettyCash && (
                      <Badge variant="outline" className="mt-2 text-xs">
                        Petty Cash
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Panel - Invoice Details & Matching */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Target size={20} className="mr-2" />
              Project Matching
            </CardTitle>
            <CardDescription>
              AI-powered project assignment with manual review
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedInvoice ? (
              <div className="text-center py-8">
                <Brain size={48} className="mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600">Select an invoice to start matching</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Invoice Details */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-medium mb-3">Invoice Details</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">File:</span>
                      <p className="font-medium">{selectedInvoice.fileName}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Vendor:</span>
                      <p className="font-medium">{selectedInvoice.vendorName || "Unknown"}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Amount:</span>
                      <p className="font-medium">
                        {formatAmount(selectedInvoice.totalAmount, selectedInvoice.currency)}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Status:</span>
                      <div className="mt-1">{getStatusBadge(selectedInvoice.matchStatus)}</div>
                    </div>
                  </div>
                  
                  {selectedInvoice.extractedData?.projectName && (
                    <div className="mt-3 pt-3 border-t">
                      <span className="text-gray-500">Extracted Project:</span>
                      <p className="font-medium">{selectedInvoice.extractedData.projectName}</p>
                    </div>
                  )}
                </div>

                {/* Process Button */}
                {!selectedInvoice.pettyCashChecked && (
                  <Button 
                    onClick={() => handleProcessInvoice(selectedInvoice)}
                    disabled={processing || processInvoiceMutation.isPending}
                    className="w-full"
                  >
                    {processing || processInvoiceMutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Processing...
                      </>
                    ) : (
                      <>
                        <Brain size={16} className="mr-2" />
                        Start AI Analysis
                      </>
                    )}
                  </Button>
                )}

                {/* AI Match Results */}
                {matches.length > 0 && (
                  <div className="space-y-4">
                    <Separator />
                    <h3 className="font-medium flex items-center">
                      <Target size={16} className="mr-2" />
                      AI Match Results
                    </h3>
                    
                    {matches.map((match, index) => (
                      <div key={match.project.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h4 className="font-medium">{match.project.name}</h4>
                            <p className="text-sm text-gray-600">{match.project.projectId}</p>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-blue-600">
                              {match.matchScore.toFixed(1)}%
                            </div>
                            <div className="text-xs text-gray-500">confidence</div>
                          </div>
                        </div>
                        
                        <Progress value={match.matchScore} className="mb-3" />
                        
                        <p className="text-sm text-gray-600 mb-3">{match.matchReason}</p>
                        
                        {match.project.description && (
                          <p className="text-xs text-gray-500 mb-3">
                            {match.project.description}
                          </p>
                        )}
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center text-xs text-gray-500">
                            <MapPin size={12} className="mr-1" />
                            {match.project.city || match.project.address || "Location not specified"}
                          </div>
                          <Button 
                            size="sm"
                            onClick={() => handleAssignProject(match.project.projectId, match.matchScore)}
                            disabled={assignProjectMutation.isPending}
                          >
                            Assign Project
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Manual Project Selection */}
                {selectedInvoice.pettyCashChecked && !selectedInvoice.isPettyCash && (
                  <div className="space-y-4">
                    <Separator />
                    <h3 className="font-medium flex items-center">
                      <Search size={16} className="mr-2" />
                      Manual Project Selection
                    </h3>
                    
                    <div className="space-y-3">
                      <Input
                        placeholder="Search projects..."
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                      />
                      
                      <div className="max-h-64 overflow-y-auto space-y-2">
                        {filteredProjects.map((project: Project) => (
                          <div 
                            key={project.id} 
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                          >
                            <div className="flex-1">
                              <div className="font-medium text-sm">{project.name}</div>
                              <div className="text-xs text-gray-500">{project.projectId}</div>
                              {project.city && (
                                <div className="text-xs text-gray-400 flex items-center mt-1">
                                  <MapPin size={10} className="mr-1" />
                                  {project.city}
                                </div>
                              )}
                            </div>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleAssignProject(project.projectId)}
                              disabled={assignProjectMutation.isPending}
                            >
                              Assign
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                {selectedInvoice.pettyCashChecked && !selectedInvoice.isPettyCash && (
                  <div className="flex space-x-2 pt-4">
                    <Button 
                      variant="outline" 
                      onClick={handleMarkNoMatch}
                      disabled={markNoMatchMutation.isPending}
                      className="flex-1"
                    >
                      <XCircle size={16} className="mr-2" />
                      No Match
                    </Button>
                  </div>
                )}

                {/* Petty Cash Notice */}
                {selectedInvoice.isPettyCash && (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-center">
                      <AlertTriangle size={16} className="text-yellow-600 mr-2" />
                      <span className="font-medium text-yellow-800">Petty Cash Invoice</span>
                    </div>
                    <p className="text-sm text-yellow-700 mt-1">
                      This invoice is below the petty cash threshold and has been routed to petty cash processing.
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}