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
    queryKey: ["/api/invoices", "/api/projects"],
    select: () => {
      if (!invoices.length || !projects.length) {
        return {
          totalInvoices: 0,
          matched: 0,
          needsReview: 0,
          unmatched: 0,
          totalValue: "0.00",
        };
      }

      const totalInvoices = invoices.length;
      // Only count as matched if invoice has status 'approved' (approved project match)
      const matched = invoices.filter(invoice => invoice.status === 'approved').length;
      const needsReview = invoices.filter(invoice => {
        const status = getMatchStatus(invoice, confidenceThreshold[0]);
        return invoice.status !== 'approved' && status.status === "needs_review";
      }).length;
      const unmatched = totalInvoices - matched - needsReview;
      const totalValue = invoices.reduce((sum, invoice) => 
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

      // Update invoice status to 'matched' after successful project match
      const updateResponse = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: 'matched' }),
      });
      if (!updateResponse.ok) throw new Error("Failed to update invoice status");

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/petty-cash"] });
      toast({
        title: "Success",
        description: "Project match approved and invoice status updated to approved",
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

  const handleApproveMatch = async (invoiceId: number, projectId: string) => {
    try {
      // Create the project match using the existing mutation
      await createMatchMutation.mutateAsync({
        invoiceId,
        projectId,
        matchScore: 95,
        matchDetails: {
          type: 'approved',
          reason: 'Best match approved by user',
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to approve project match",
        variant: "destructive",
      });
    }
  };

  const handleManualMatch = async (invoice: Invoice, project: Project) => {
    try {
      // Create the project match using the existing mutation
      await createMatchMutation.mutateAsync({
        invoiceId: invoice.id,
        projectId: project.projectId,
        matchScore: 100,
        matchDetails: {
          type: 'manual',
          reason: 'Manually assigned by user',
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to assign project to invoice",
        variant: "destructive",
      });
    }
  };

  // Helper function to calculate string similarity
  const calculateStringSimilarity = (str1: string, str2: string): number => {
    if (!str1 || !str2) return 0;

    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 100;

    const distance = levenshteinDistance(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);

    if (maxLength === 0) return 100;

    return Math.round(((maxLength - distance) / maxLength) * 100);
  };

  const levenshteinDistance = (str1: string, str2: string): number => {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[str2.length][str1.length];
  };

  // Get extracted project based on address/city matching with validation records
  const getExtractedProject = (invoice: Invoice, projects: Project[]): string => {
    const invoiceAddress = invoice.extractedData?.projectAddress || invoice.extractedData?.address;
    let invoiceCity = invoice.extractedData?.projectCity || invoice.extractedData?.city;

    // If no explicit project city, try to extract from vendor address
    if (!invoiceCity && invoice.extractedData?.vendorAddress) {
      const vendorAddress = invoice.extractedData.vendorAddress;
      const addressParts = vendorAddress.split(',').map(part => part.trim());
      if (addressParts.length >= 2) {
        invoiceCity = addressParts[1]; // Take the city part
      }
    }

    if (!invoiceAddress && !invoiceCity) return '';

    let bestMatch = { project: null, score: 0 };

    for (const project of projects) {
      let score = 0;
      let matchCount = 0;

      if (invoiceAddress && project.address) {
        const addressSimilarity = calculateStringSimilarity(invoiceAddress, project.address);
        if (addressSimilarity > 60) {
          score += addressSimilarity * 0.7; // 70% weight for address
          matchCount++;
        }
      }

      if (invoiceCity && project.city) {
        const citySimilarity = calculateStringSimilarity(invoiceCity, project.city);
        if (citySimilarity > 80) {
          score += citySimilarity * 0.3; // 30% weight for city
          matchCount++;
        }
      }

      const finalScore = matchCount > 0 ? score / matchCount : 0;

      if (finalScore > bestMatch.score && finalScore > 70) {
        bestMatch = { project, score: finalScore };
      }
    }

    return bestMatch.project?.name || '';
  };

  // Get best project match from validation records only
  const getBestProjectMatch = (invoice: Invoice, projects: Project[]) => {
    const invoiceAddress = invoice.extractedData?.projectAddress || invoice.extractedData?.address;
    let invoiceCity = invoice.extractedData?.projectCity || invoice.extractedData?.city;

    // If no explicit project city, try to extract from vendor address
    if (!invoiceCity && invoice.extractedData?.vendorAddress) {
      const vendorAddress = invoice.extractedData.vendorAddress;
      const addressParts = vendorAddress.split(',').map(part => part.trim());
      if (addressParts.length >= 2) {
        invoiceCity = addressParts[1]; // Take the city part
      }
    }

    if (!invoiceAddress && !invoiceCity) {
      return { project: null, confidence: 0 };
    }

    let bestMatch = { project: null, confidence: 0 };

    for (const project of projects) {
      let totalScore = 0;
      let weightSum = 0;

      // Address matching (70% weight)
      if (invoiceAddress && project.address) {
        const addressSimilarity = calculateStringSimilarity(invoiceAddress, project.address);
        totalScore += addressSimilarity * 0.7;
        weightSum += 0.7;
      }

      // City matching (30% weight)
      if (invoiceCity && project.city) {
        const citySimilarity = calculateStringSimilarity(invoiceCity, project.city);
        totalScore += citySimilarity * 0.3;
        weightSum += 0.3;
      }

      const finalConfidence = weightSum > 0 ? Math.round(totalScore / weightSum) : 0;

      if (finalConfidence > bestMatch.confidence) {
        bestMatch = { project, confidence: finalConfidence };
      }
    }

    return bestMatch;
  };

  const getMatchStatus = (invoice: Invoice, threshold: number = 85) => {
    const bestMatch = getBestProjectMatch(invoice, projects);

    if (!bestMatch.project) {
      return { status: "needs_review", label: "Needs Review", color: "yellow" };
    }

    if (bestMatch.confidence >= threshold) {
      return { status: "matched", label: "Matched", color: "green" };
    } else if (bestMatch.confidence >= 60) {
      return { status: "needs_review", label: "Needs Review", color: "yellow" };
    } else {
      return { status: "unmatched", label: "Unmatched", color: "red" };
    }
  };

  const filteredInvoices = invoices.filter(invoice => {
    let statusMatch = false;
    
    if (activeTab === "all") {
      statusMatch = true;
    } else if (activeTab === "matched") {
      // Only show invoices that have been actually matched (approved)
      statusMatch = invoice.status === 'approved';
    } else if (activeTab === "needs_review") {
      // Show invoices that are not approved but have potential matches
      const matchStatus = getMatchStatus(invoice, confidenceThreshold[0]);
      statusMatch = invoice.status !== 'approved' && matchStatus.status === "needs_review";
    } else if (activeTab === "unmatched") {
      // Show invoices with no good matches and not already approved
      const matchStatus = getMatchStatus(invoice, confidenceThreshold[0]);
      statusMatch = invoice.status !== 'approved' && matchStatus.status === "unmatched";
    }

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
                <div className="overflow-x-auto">
                  <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Extracted Address</TableHead>
                      <TableHead>Extracted City</TableHead>
                      <TableHead>Extracted Project</TableHead>
                      <TableHead>Best Match</TableHead>
                      <TableHead>Best Match Address</TableHead>
                      <TableHead>Best Match City</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((invoice) => {
                      const status = getMatchStatus(invoice, confidenceThreshold[0]);
                      const isMatching = matchingInProgress === invoice.id;
                      const bestMatch = getBestProjectMatch(invoice, projects);

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
                              {invoice.extractedData?.projectAddress || invoice.extractedData?.address || 'N/A'}
                            </div>
                          </TableCell>
                          <TableCell>
                            {(() => {
                              // Use projectCity if available, otherwise derive from vendor address
                              let city = invoice.extractedData?.projectCity || invoice.extractedData?.city;

                              if (!city && invoice.extractedData?.vendorAddress) {
                                const vendorAddress = invoice.extractedData.vendorAddress;
                                const addressParts = vendorAddress.split(',').map(part => part.trim());
                                if (addressParts.length >= 2) {
                                  city = addressParts.slice(1).join(', ');
                                }
                              }

                              return city || 'N/A';
                            })()}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">
                                {invoice.extractedData?.projectName || getExtractedProject(invoice, projects) || 'N/A'}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {invoice.extractedData?.projectName ? 'From extracted data' : 'Inferred from address/city'}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">
                                {bestMatch?.project?.name || 'No match found'}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                <Building2 className="w-3 h-3 inline mr-1" />
                                {bestMatch?.project?.projectId || 'From validation records'}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-muted-foreground" />
                              {bestMatch?.project?.address || 'N/A'}
                            </div>
                          </TableCell>
                          <TableCell>
                            {bestMatch?.project?.city || 'N/A'}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-2">
                              <Progress value={bestMatch?.confidence || 0} className="w-20" />
                              <span className="text-sm">
                                {bestMatch?.confidence || 0}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {invoice.status === 'matched' ? (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Matched
                              </Badge>
                            ) : (
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
                            )}
                          </TableCell>
                          <TableCell>
                            {invoice.status === 'matched' ? (
                              <Badge variant="outline" className="text-green-600 border-green-600">
                                Project Assigned
                              </Badge>
                            ) : (
                              <div className="flex items-center gap-2">
                                {bestMatch?.project && bestMatch.confidence >= 60 ? (
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => handleManualMatch(invoice, bestMatch.project)}
                                    className="bg-green-600 hover:bg-green-700"
                                  >
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    Approve Best Match
                                  </Button>
                                ) : null}

                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button size="sm" variant="outline">
                                      <Target className="w-4 h-4 mr-2" />
                                      Assign Manual Project
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-4xl">
                                    <DialogHeader>
                                      <DialogTitle>Manual Project Assignment</DialogTitle>
                                    </DialogHeader>
                                    <InvoiceMatchingDialog 
                                      invoice={invoice} 
                                      projects={projects}
                                      onManualMatch={handleManualMatch}
                                    />
                                  </DialogContent>
                                </Dialog>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>
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

  // Helper functions for the dialog
  const calculateStringSimilarity = (str1: string, str2: string): number => {
    if (!str1 || !str2) return 0;

    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 100;

    const distance = levenshteinDistance(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);

    if (maxLength === 0) return 100;

    return Math.round(((maxLength - distance) / maxLength) * 100);
  };

  const levenshteinDistance = (str1: string, str2: string): number => {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let i = 1; i <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[str2.length][str1.length];
  };

  const getExtractedProject = (invoice: Invoice, projects: Project[]): string => {
    const invoiceAddress = invoice.extractedData?.projectAddress || invoice.extractedData?.address;
    let invoiceCity = invoice.extractedData?.projectCity || invoice.extractedData?.city;

    if (!invoiceCity && invoice.extractedData?.vendorAddress) {
      const vendorAddress = invoice.extractedData.vendorAddress;
      const addressParts = vendorAddress.split(',').map(part => part.trim());
      if (addressParts.length >= 2) {
        invoiceCity = addressParts[1];
      }
    }

    if (!invoiceAddress && !invoiceCity) return '';

    let bestMatch = { project: null, score: 0 };

    for (const project of projects) {
      let score = 0;
      let matchCount = 0;

      if (invoiceAddress && project.address) {
        const addressSimilarity = calculateStringSimilarity(invoiceAddress, project.address);
        if (addressSimilarity > 60) {
          score += addressSimilarity * 0.7;
          matchCount++;
        }
      }

      if (invoiceCity && project.city) {
        const citySimilarity = calculateStringSimilarity(invoiceCity, project.city);
        if (citySimilarity > 80) {
          score += citySimilarity * 0.3;
          matchCount++;
        }
      }

      const finalScore = matchCount > 0 ? score / matchCount : 0;

      if (finalScore > bestMatch.score && finalScore > 70) {
        bestMatch = { project, score: finalScore };
      }
    }

    return bestMatch.project?.name || '';
  };

  const getBestProjectMatch = (invoice: Invoice, projects: Project[]) => {
    const invoiceAddress = invoice.extractedData?.projectAddress || invoice.extractedData?.address;
    let invoiceCity = invoice.extractedData?.projectCity || invoice.extractedData?.city;

    if (!invoiceCity && invoice.extractedData?.vendorAddress) {
      const vendorAddress = invoice.extractedData.vendorAddress;
      const addressParts = vendorAddress.split(',').map(part => part.trim());
      if (addressParts.length >= 2) {
        invoiceCity = addressParts[1];
      }
    }

    if (!invoiceAddress && !invoiceCity) {
      return { project: null, confidence: 0 };
    }

    let bestMatch = { project: null, confidence: 0 };

    for (const project of projects) {
      let totalScore = 0;
      let weightSum = 0;

      if (invoiceAddress && project.address) {
        const addressSimilarity = calculateStringSimilarity(invoiceAddress, project.address);
        totalScore += addressSimilarity * 0.7;
        weightSum += 0.7;
      }

      if (invoiceCity && project.city) {
        const citySimilarity = calculateStringSimilarity(invoiceCity, project.city);
        totalScore += citySimilarity * 0.3;
        weightSum += 0.3;
      }

      const finalConfidence = weightSum > 0 ? Math.round(totalScore / weightSum) : 0;

      if (finalConfidence > bestMatch.confidence) {
        bestMatch = { project, confidence: finalConfidence };
      }
    }

    return bestMatch;
  };

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
            <div><strong>Extracted Project:</strong> {invoice.extractedData?.projectName || getExtractedProject(invoice, projects) || 'N/A'}</div>
            <div><strong>Alternative Project Name:</strong> {invoice.extractedData?.projectName ? getExtractedProject(invoice, projects) || 'N/A' : 'N/A'}</div>
            <div><strong>Extracted Project Address:</strong> {invoice.extractedData?.projectAddress || 'N/A'}</div>
            <div><strong>Extracted Address:</strong> {invoice.extractedData?.address || 'N/A'}</div>
            <div><strong>Extracted Project City:</strong> {invoice.extractedData?.projectCity || 'N/A'}</div>
            <div><strong>Extracted City:</strong> {invoice.extractedData?.city || 'N/A'}</div>
            <div><strong>Vendor Address:</strong> {invoice.extractedData?.vendorAddress || 'N/A'}</div>
            <div><strong>Best Match:</strong> {getBestProjectMatch(invoice, projects)?.project?.name || 'N/A'}</div>
            <div><strong>Match Confidence:</strong> {getBestProjectMatch(invoice, projects)?.confidence || 0}%</div>
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