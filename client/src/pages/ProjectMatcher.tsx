import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Filter
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
  const [confidenceThreshold, setConfidenceThreshold] = useState([85]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [matchingInProgress, setMatchingInProgress] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  
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

  const getMatchStatus = (invoice: Invoice) => {
    // This would need to be enhanced to check actual matches from the database
    const hasExtractedData = invoice.extractedData?.projectName || invoice.extractedData?.address;
    const threshold = confidenceThreshold[0];
    
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
    const statusMatch = filterStatus === "all" || getMatchStatus(invoice).status === filterStatus;
    const searchMatch = !searchTerm || 
      invoice.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.vendorName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.extractedData?.projectName?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return statusMatch && searchMatch;
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Project Matcher</h1>
          <p className="text-muted-foreground">
            Match invoices with projects using AI-powered analysis
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="text-sm">
            <Target className="w-4 h-4 mr-2" />
            Threshold: {confidenceThreshold[0]}%
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Invoice Overview</TabsTrigger>
          <TabsTrigger value="settings">Matching Settings</TabsTrigger>
          <TabsTrigger value="unresolved">Unresolved Matches</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Matching Controls
              </CardTitle>
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

          {/* Invoice Table */}
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
                    const status = getMatchStatus(invoice);
                    const isMatching = matchingInProgress === invoice.id;
                    
                    return (
                      <TableRow key={invoice.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{invoice.fileName}</div>
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

        <TabsContent value="settings">
          <MatchingSettings 
            threshold={confidenceThreshold[0]} 
            onThresholdChange={(value) => setConfidenceThreshold([value])}
          />
        </TabsContent>

        <TabsContent value="unresolved">
          <UnresolvedMatches />
        </TabsContent>
      </Tabs>
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

// Matching Settings Component
function MatchingSettings({ 
  threshold, 
  onThresholdChange 
}: { 
  threshold: number; 
  onThresholdChange: (value: number) => void; 
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Matching Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div>
            <Label className="text-base font-medium">Auto-Match Confidence Threshold</Label>
            <p className="text-sm text-muted-foreground mb-4">
              Invoices with match confidence above this threshold will be automatically matched.
            </p>
            <div className="space-y-2">
              <Slider
                value={[threshold]}
                onValueChange={(value) => onThresholdChange(value[0])}
                max={100}
                min={0}
                step={5}
                className="w-full max-w-sm"
              />
              <div className="flex justify-between text-sm text-muted-foreground max-w-sm">
                <span>0% (Manual only)</span>
                <span className="font-medium">{threshold}%</span>
                <span>100% (Exact match)</span>
              </div>
            </div>
          </div>
          
          <div className="pt-4 border-t">
            <h4 className="font-medium mb-2">Matching Criteria Weights</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="p-3 bg-muted rounded-lg">
                <div className="font-medium">Project Name</div>
                <div className="text-muted-foreground">Weight: 50%</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="font-medium">Address</div>
                <div className="text-muted-foreground">Weight: 30%</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="font-medium">City</div>
                <div className="text-muted-foreground">Weight: 20%</div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Unresolved Matches Component  
function UnresolvedMatches() {
  const { data: unresolvedMatches = [] } = useQuery<(InvoiceProjectMatch & { invoice: Invoice; project: Project })[]>({
    queryKey: ["/api/project-matches/unresolved"],
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Unresolved Project Matches</CardTitle>
      </CardHeader>
      <CardContent>
        {unresolvedMatches.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
            <p>All project matches have been resolved!</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Potential Project</TableHead>
                <TableHead>Match Score</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unresolvedMatches.map((match) => (
                <TableRow key={match.id}>
                  <TableCell>{match.invoice.fileName}</TableCell>
                  <TableCell>{match.project.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{match.matchScore}%</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline">
                        Review
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}