import { useState } from "react";
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
    invoiceNumber?: string;
  };
  projectName?: string;
  createdAt: string;
  projectMatches?: InvoiceProjectMatch[];
}

interface Project {
  id: number;
  projectId: string;
  name: string;
  address?: string;
  city?: string;
  status: string;
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

  // Get best project match
  const getBestProjectMatch = (invoice: Invoice, projects: Project[]) => {
    const invoiceAddress = invoice.extractedData?.address;
    const invoiceCity = invoice.extractedData?.city;

    if (!invoiceAddress && !invoiceCity) {
      return { project: null, confidence: 0 };
    }

    let bestMatch = { project: null as Project | null, confidence: 0 };

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

  // Calculate stats for the dashboard cards
  const { data: stats } = useQuery({
    queryKey: ["project-matcher-stats", invoices, confidenceThreshold],
    queryFn: () => {
      const totalInvoices = invoices.length;

      // Count invoices with approved matches as matched
      const matched = invoices.filter(invoice => {
        const hasApprovedMatch = invoice.projectMatches && 
          invoice.projectMatches.some(match => 
            match.status === 'manual'
          );
        return hasApprovedMatch;
      }).length;

      // Count invoices that have potential matches but no approved matches as needs review
      const needsReview = invoices.filter(invoice => {
        const hasApprovedMatch = invoice.projectMatches && 
          invoice.projectMatches.some(match => 
            match.status === 'manual'
          );

        if (hasApprovedMatch) return false;

        const bestMatch = getBestProjectMatch(invoice, projects);
        return bestMatch.project && bestMatch.confidence >= 60;
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

  const handleFindMatches = async (invoice: Invoice) => {
    setMatchingInProgress(invoice.id);
    findMatchesMutation.mutate(invoice.id);
  };

  const handleApproveMatch = async (invoiceId: number, projectId: string) => {
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/create-project-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectId,
          matchScore: 95,
          matchDetails: {
            type: 'approved',
            reason: 'Best match approved by user',
            timestamp: new Date().toISOString()
          },
          status: 'manual'
        })
      });

      if (response.ok) {
        toast({
          title: "Match Approved",
          description: "Invoice has been matched to the selected project",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to approve project match",
        variant: "destructive",
      });
    }
  };

  const filteredInvoices = invoices.filter(invoice => {
    const status = getMatchStatus(invoice, confidenceThreshold[0]);
    
    // Filter by tab
    let tabMatch = true;
    if (activeTab === "matched") {
      tabMatch = status.status === "matched";
    } else if (activeTab === "needs_review") {
      tabMatch = status.status === "needs_review";
    } else if (activeTab === "unmatched") {
      tabMatch = status.status === "unmatched";
    }

    // Filter by status
    let statusMatch = true;
    if (filterStatus !== "all") {
      statusMatch = invoice.status === filterStatus;
    }

    // Filter by search term
    const searchMatch = !searchTerm || 
      invoice.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.vendorName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.extractedData?.projectName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.extractedData?.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.id.toString().includes(searchTerm);

    return tabMatch && statusMatch && searchMatch;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center space-x-2">
                <Target className="text-blue-600" size={32} />
                <span>AI Project Matcher</span>
              </h1>
              <p className="text-gray-600 mt-2">
                Match invoices to projects using intelligent algorithms and AI-powered insights
              </p>
            </div>
            <div className="flex space-x-3">
              <Button variant="outline" size="sm">
                <Settings size={16} className="mr-2" />
                Settings
              </Button>
            </div>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Invoices</p>
                  <p className="text-3xl font-bold text-gray-900">{stats?.totalInvoices || 0}</p>
                </div>
                <Building2 className="h-8 w-8 text-blue-600" />
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
                <CheckCircle className="h-8 w-8 text-green-600" />
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
                <AlertTriangle className="h-8 w-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Value</p>
                  <p className="text-2xl font-bold text-gray-900">${stats?.totalValue || '0.00'}</p>
                </div>
                <DollarSign className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs and Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="all">All Invoices</TabsTrigger>
                  <TabsTrigger value="matched">Matched</TabsTrigger>
                  <TabsTrigger value="needs_review">Needs Review</TabsTrigger>
                  <TabsTrigger value="unmatched">Unmatched</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Search size={16} className="text-gray-500" />
                  <Input
                    placeholder="Search invoices..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-64"
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <Filter size={16} className="text-gray-500" />
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="matched">Matched</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Confidence Threshold Setting */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center space-x-4">
              <Label className="text-sm font-medium">Confidence Threshold:</Label>
              <div className="flex-1 max-w-xs">
                <Slider
                  value={confidenceThreshold}
                  onValueChange={setConfidenceThreshold}
                  max={100}
                  min={50}
                  step={5}
                  className="w-full"
                />
              </div>
              <span className="text-sm font-medium text-gray-600 min-w-12">{confidenceThreshold[0]}%</span>
            </div>
          </CardContent>
        </Card>

        {/* Invoice Table */}
        <Card>
          <CardHeader>
            <CardTitle>Invoice Project Matching</CardTitle>
            <p className="text-sm text-gray-600">
              AI-powered project matching with intelligent confidence scoring
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice Details</TableHead>
                  <TableHead>Extracted Data</TableHead>
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
                  const bestMatch = getBestProjectMatch(invoice, projects);

                  return (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-gray-900">{invoice.fileName}</p>
                          <p className="text-sm text-gray-500">
                            {invoice.vendorName} • ${invoice.totalAmount} {invoice.currency}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          <div><strong>Project:</strong> {invoice.extractedData?.projectName || 'N/A'}</div>
                          <div><strong>Address:</strong> {invoice.extractedData?.address || 'N/A'}</div>
                          <div><strong>City:</strong> {invoice.extractedData?.city || 'N/A'}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          {bestMatch.project ? (
                            <div>
                              <p className="font-medium text-gray-900">{bestMatch.project.name}</p>
                              <p className="text-sm text-gray-500">{bestMatch.project.city}</p>
                            </div>
                          ) : (
                            <span className="text-gray-500">No match found</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Progress value={bestMatch.confidence} className="w-16" />
                          <span className="text-sm font-medium">{bestMatch.confidence}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          className={
                            status.color === "green" 
                              ? "bg-green-100 text-green-800"
                              : status.color === "yellow"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                          }
                        >
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => setSelectedInvoice(invoice)}
                              >
                                <Eye size={14} className="mr-1" />
                                Review
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-4xl">
                              <DialogHeader>
                                <DialogTitle>Invoice Matching Review</DialogTitle>
                              </DialogHeader>
                              {selectedInvoice && (
                                <div className="space-y-6">
                                  <div className="grid grid-cols-2 gap-6">
                                    <div>
                                      <h3 className="font-semibold mb-3">Invoice Information</h3>
                                      <div className="space-y-2 text-sm">
                                        <div><strong>Invoice #:</strong> {selectedInvoice.extractedData?.invoiceNumber || selectedInvoice.id}</div>
                                        <div><strong>File:</strong> {selectedInvoice.fileName}</div>
                                        <div><strong>Vendor:</strong> {selectedInvoice.vendorName || 'N/A'}</div>
                                        <div><strong>Amount:</strong> {selectedInvoice.totalAmount} {selectedInvoice.currency}</div>
                                        <div><strong>Extracted Project:</strong> {selectedInvoice.extractedData?.projectName || 'N/A'}</div>
                                      </div>
                                    </div>
                                    <div>
                                      <h3 className="font-semibold mb-3">Best Match Details</h3>
                                      <div className="space-y-2 text-sm">
                                        {bestMatch.project ? (
                                          <>
                                            <div><strong>Project:</strong> {bestMatch.project.name}</div>
                                            <div><strong>Project ID:</strong> {bestMatch.project.projectId}</div>
                                            <div><strong>Address:</strong> {bestMatch.project.address || 'N/A'}</div>
                                            <div><strong>City:</strong> {bestMatch.project.city || 'N/A'}</div>
                                            <div><strong>Confidence:</strong> {bestMatch.confidence}%</div>
                                          </>
                                        ) : (
                                          <div>No suitable match found</div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  {bestMatch.project && bestMatch.confidence >= 60 && (
                                    <div className="flex justify-end space-x-2">
                                      <Button
                                        onClick={() => handleApproveMatch(selectedInvoice.id, bestMatch.project!.projectId)}
                                        className="bg-green-600 hover:bg-green-700 text-white"
                                      >
                                        <CheckCircle size={16} className="mr-2" />
                                        Approve Match
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>
                          
                          {status.status !== "matched" && (
                            <Button
                              size="sm"
                              onClick={() => handleFindMatches(invoice)}
                              disabled={isMatching}
                              className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                              {isMatching ? (
                                <>
                                  <Clock size={14} className="mr-1 animate-spin" />
                                  Matching...
                                </>
                              ) : (
                                <>
                                  <Zap size={14} className="mr-1" />
                                  Find Matches
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}