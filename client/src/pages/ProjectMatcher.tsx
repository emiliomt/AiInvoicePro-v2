
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { 
  Search, 
  Target, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  Building2, 
  MapPin, 
  Settings,
  Eye,
  Zap,
  Filter,
  DollarSign
} from "lucide-react";

interface Invoice {
  id: number;
  fileName: string;
  vendorName?: string;
  totalAmount?: string;
  currency?: string;
  status: string;
  extractedData?: {
    projectName?: string;
    address?: string;
    city?: string;
    vendorName?: string;
  };
  projectName?: string;
  createdAt: string;
}

interface Project {
  id: number;
  projectId: string;
  name: string;
  address?: string;
  city?: string;
  status: string;
}

interface ProjectMatch {
  project: Project;
  matchScore: number;
  matchDetails: {
    addressSimilarity: number;
    citySimilarity: number;
    projectNameSimilarity: number;
    overallConfidence: number;
    matchedFields: string[];
    reasons: string[];
  };
}

interface InvoiceProjectMatch {
  id: number;
  invoiceId: number;
  projectId: string;
  matchScore: string;
  status: 'auto' | 'manual' | 'unresolved';
  isActive: boolean;
  project: Project;
  matchDetails: any;
}

export default function ProjectMatcher() {
  const { user } = useAuth();
  const [confidenceThreshold, setConfidenceThreshold] = useState([85]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [matchingInProgress, setMatchingInProgress] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all invoices
  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  // Fetch all projects
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Calculate stats for the dashboard cards
  const { data: stats } = useQuery({
    queryKey: ["/api/invoices"],
    select: (data: Invoice[]) => {
      const totalInvoices = data.length;
      const matched = data.filter(invoice => 
        invoice.extractedData?.projectName && 
        getMatchStatus(invoice, confidenceThreshold[0]).status === "matched"
      ).length;
      const needsReview = data.filter(invoice => 
        getMatchStatus(invoice, confidenceThreshold[0]).status === "needs_review"
      ).length;
      const unmatched = totalInvoices - matched - needsReview;
      const totalValue = data.reduce((sum, invoice) => 
        sum + parseFloat(invoice.totalAmount || "0"), 0
      );
      
      return {
        totalInvoices,
        matched,
        needsReview,
        unmatched,
        totalValue: totalValue.toFixed(2),
      };
    },
  });

  // Find project matches mutation
  const findMatchesMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const response = await fetch(`/api/invoices/${invoiceId}/find-project-matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to find matches");
      return response.json();
    },
    onSuccess: (matches, invoiceId) => {
      queryClient.setQueryData(["/api/invoices", invoiceId, "project-matches"], matches);
      setMatchingInProgress(null);
      
      // Invalidate related queries to update stats across modules
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/petty-cash"] });
      
      toast({
        title: "Matching Complete",
        description: `Found ${matches.length} potential project matches`,
      });
    },
    onError: () => {
      setMatchingInProgress(null);
      toast({
        title: "Error",
        description: "Failed to find project matches",
        variant: "destructive",
      });
    },
  });

  // Create project match mutation
  const createMatchMutation = useMutation({
    mutationFn: async ({ invoiceId, projectId, matchScore, matchDetails }: {
      invoiceId: number;
      projectId: string;
      matchScore: number;
      matchDetails: any;
    }) => {
      const response = await fetch(`/api/invoices/${invoiceId}/create-project-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, matchScore, matchDetails, status: 'manual' }),
      });
      if (!response.ok) throw new Error("Failed to create match");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/petty-cash"] });
      toast({
        title: "Success",
        description: "Project match created successfully",
      });
    },
  });

  // Set active match mutation
  const setActiveMatchMutation = useMutation({
    mutationFn: async ({ invoiceId, matchId }: { invoiceId: number; matchId: number }) => {
      const response = await fetch(`/api/invoices/${invoiceId}/set-active-project-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
      });
      if (!response.ok) throw new Error("Failed to set active match");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/petty-cash"] });
      toast({
        title: "Success", 
        description: "Active project match updated",
      });
    },
  });

  // Get existing matches for an invoice
  const getInvoiceMatches = (invoiceId: number) => {
    return useQuery<InvoiceProjectMatch[]>({
      queryKey: ["/api/invoices", invoiceId, "project-matches"],
      enabled: false,
    });
  };

  const handleFindMatches = async (invoice: Invoice) => {
    setMatchingInProgress(invoice.id);
    findMatchesMutation.mutate(invoice.id);
  };

  const handleManualMatch = (invoice: Invoice, project: Project) => {
    createMatchMutation.mutate({
      invoiceId: invoice.id,
      projectId: project.projectId,
      matchScore: 100, // Manual matches get 100% score
      matchDetails: {
        type: 'manual',
        reason: 'Manually assigned by user',
        matchedFields: ['manual'],
      },
    });
  };

  const getMatchStatus = (invoice: Invoice, threshold: number = 85) => {
    const hasExtractedData = invoice.extractedData?.projectName || invoice.extractedData?.address;
    
    if (!hasExtractedData) {
      return { status: "needs_review", label: "Needs Review", color: "yellow" };
    }
    
    // For demo purposes, simulate match confidence
    const mockConfidence = Math.random() * 100;
    if (mockConfidence >= threshold) {
      return { status: "matched", label: "Matched", color: "green" };
    } else {
      return { status: "needs_review", label: "Needs Review", color: "yellow" };
    }
  };

  const filteredInvoices = invoices.filter(invoice => {
    const statusMatch = activeTab === "all" || getMatchStatus(invoice, confidenceThreshold[0]).status === activeTab;
    const searchMatch = !searchTerm || 
      invoice.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.vendorName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.extractedData?.projectName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.extractedData?.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.id.toString().includes(searchTerm);
    
    return statusMatch && searchMatch;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Project Matcher</h1>
          <p className="text-gray-600 mt-2">
            Match invoices with projects using AI-powered analysis
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Invoices</p>
                  <p className="text-3xl font-bold text-gray-900">{stats?.totalInvoices || 0}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Building2 className="text-blue-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Matched</p>
                  <p className="text-3xl font-bold text-green-600">{stats?.matched || 0}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="text-green-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Needs Review</p>
                  <p className="text-3xl font-bold text-yellow-600">{stats?.needsReview || 0}</p>
                </div>
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="text-yellow-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Value</p>
                  <p className="text-3xl font-bold text-gray-900">${stats?.totalValue || "0.00"}</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="text-purple-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Threshold</p>
                  <p className="text-3xl font-bold text-indigo-600">{confidenceThreshold[0]}%</p>
                </div>
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <Target className="text-indigo-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Matching Configuration */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Project Matching Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Confidence Threshold</Label>
                <div className="px-4 py-2 border rounded-md">
                  <Slider
                    value={confidenceThreshold}
                    onValueChange={setConfidenceThreshold}
                    max={100}
                    min={0}
                    step={5}
                    className="w-full"
                  />
                  <div className="flex justify-between text-sm text-muted-foreground mt-1">
                    <span>0%</span>
                    <span className="font-medium">{confidenceThreshold[0]}%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Filter by Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Invoices</SelectItem>
                    <SelectItem value="matched">Matched</SelectItem>
                    <SelectItem value="needs_review">Needs Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search invoices..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs for filtering project matching records */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all" className="flex items-center space-x-2">
              <span>All</span>
              <Badge variant="secondary" className="ml-1">{stats?.totalInvoices || 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="matched" className="flex items-center space-x-2">
              <CheckCircle size={16} />
              <span>Matched</span>
              <Badge variant="secondary" className="ml-1">{stats?.matched || 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="needs_review" className="flex items-center space-x-2">
              <AlertTriangle size={16} />
              <span>Needs Review</span>
              <Badge variant="secondary" className="ml-1">{stats?.needsReview || 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="unmatched" className="flex items-center space-x-2">
              <Clock size={16} />
              <span>Unmatched</span>
              <Badge variant="secondary" className="ml-1">{stats?.unmatched || 0}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Invoice Project Matching</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Extracted Address</TableHead>
                      <TableHead>Extracted City</TableHead>
                      <TableHead>Best Match</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((invoice) => {
                      const status = getMatchStatus(invoice, confidenceThreshold[0]);
                      const isMatching = matchingInProgress === invoice.id;
                      
                      return (
                        <TableRow key={invoice.id}>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">
                                {invoice.extractedData?.invoiceNumber || invoice.id}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {invoice.vendorName || 'N/A'}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-muted-foreground" />
                              {invoice.extractedData?.address || 'N/A'}
                            </div>
                          </TableCell>
                          <TableCell>
                            {invoice.extractedData?.city || 'N/A'}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">
                                {invoice.extractedData?.projectName || 'No match found'}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                <Building2 className="w-3 h-3 inline mr-1" />
                                Project matching needed
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-2">
                              <Progress value={Math.random() * 100} className="w-20" />
                              <span className="text-sm">
                                {Math.round(Math.random() * 100)}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={status.color === "green" ? "default" : "secondary"}
                              className={
                                status.color === "green" 
                                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                                  : status.color === "yellow"
                                  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100"
                                  : ""
                              }
                            >
                              {status.color === "green" && <CheckCircle className="w-3 h-3 mr-1" />}
                              {status.color === "yellow" && <AlertTriangle className="w-3 h-3 mr-1" />}
                              {status.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleFindMatches(invoice)}
                                disabled={isMatching}
                              >
                                {isMatching ? (
                                  <>
                                    <Clock className="w-4 h-4 mr-2 animate-spin" />
                                    Matching...
                                  </>
                                ) : (
                                  <>
                                    <Zap className="w-4 h-4 mr-2" />
                                    Find Matches
                                  </>
                                )}
                              </Button>
                              
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button size="sm" variant="ghost">
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-4xl">
                                  <DialogHeader>
                                    <DialogTitle>Invoice Details & Manual Matching</DialogTitle>
                                  </DialogHeader>
                                  <InvoiceMatchingDialog 
                                    invoice={invoice} 
                                    projects={projects}
                                    onManualMatch={handleManualMatch}
                                  />
                                </DialogContent>
                              </Dialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// Invoice Matching Dialog Component
function InvoiceMatchingDialog({ 
  invoice, 
  projects, 
  onManualMatch 
}: { 
  invoice: Invoice; 
  projects: Project[];
  onManualMatch: (invoice: Invoice, project: Project) => void;
}) {
  const [selectedProject, setSelectedProject] = useState<string>("");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h3 className="font-semibold mb-3">Invoice Information</h3>
          <div className="space-y-2 text-sm">
            <div><strong>Invoice #:</strong> {invoice.extractedData?.invoiceNumber || invoice.id}</div>
            <div><strong>File:</strong> {invoice.fileName}</div>
            <div><strong>Vendor:</strong> {invoice.vendorName || 'N/A'}</div>
            <div><strong>Amount:</strong> {invoice.totalAmount} {invoice.currency}</div>
            <div><strong>Extracted Project:</strong> {invoice.extractedData?.projectName || 'N/A'}</div>
            <div><strong>Extracted Address:</strong> {invoice.extractedData?.address || 'N/A'}</div>
            <div><strong>Extracted City:</strong> {invoice.extractedData?.city || 'N/A'}</div>
          </div>
        </div>

        <div>
          <h3 className="font-semibold mb-3">Manual Project Assignment</h3>
          <div className="space-y-4">
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger>
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.projectId} value={project.projectId}>
                    <div>
                      <div className="font-medium">{project.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {project.city} • {project.projectId}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button 
              onClick={() => {
                if (selectedProject) {
                  const project = projects.find(p => p.projectId === selectedProject);
                  if (project) onManualMatch(invoice, project);
                }
              }}
              disabled={!selectedProject}
              className="w-full"
            >
              Assign Project
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
