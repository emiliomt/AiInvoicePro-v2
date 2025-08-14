import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Brain,
  Tag,
  FileText,
  TrendingUp,
  Download,
  Upload,
  RefreshCcw,
  FileCheck,
  CheckCircle,
  Play,
  Plus,
  Trash2,
  Target,
  Bot,
  Sparkles,
  Edit,
  Database,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import Header from "@/components/Header";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
// import ProgressTracker from "@/components/ProgressTracker";

interface LineItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  unit?: string;
  rawText?: string;
}

interface ClassificationResult {
  category: string;
  confidence: number;
  method: "keyword" | "ai" | "fuzzy" | "context" | "learned" | "manual";
  subcategory?: string;
  reasoning?: string;
  keywords_matched?: string[];
}

interface VendorContext {
  vendorName?: string;
  industry?: string;
  businessType?: string;
}

interface InvoiceForProcessing {
  id: number;
  invoiceId?: number;
  invoiceNumber: string;
  vendorName: string;
  totalAmount: string;
  currency: string;
  invoiceDate: string;
  status: string;
  projectId: string;
  projectName?: string;
  matchScore: string;
  lineItemsExtracted: boolean;
  hasClassifications: boolean;
  uploadedAt?: string;
  lineItemsCount: number;
}

interface ProcessingProgress {
  status: "idle" | "processing" | "completed" | "failed";
  totalInvoices: number;
  processedInvoices: number;
  currentInvoice?: string;
  sessionId?: string;
}

interface Invoice {
  invoiceId: number;
  invoiceNumber: string;
  vendorName: string;
  projectId: number;
  projectName: string;
  totalAmount: number;
  lineItemsCount: number;
  processingStatus: string;
  uploadedAt: string;
  hasClassifications: boolean;
}

interface ClassificationResult {
  lineItem: string;
  category: string;
  subcategory?: string;
  confidence: number;
  matchedKeywords: string[];
  status: "classified" | "unclassified" | "manual";
}

interface ClassificationBatch {
  id: string;
  invoiceId: number;
  results: ClassificationResult[];
  processedAt: string;
  totalItems: number;
  classifiedItems: number;
}

interface KeywordCategory {
  id: number;
  category: string;
  subcategory?: string;
  keywords: string[];
  description?: string;
  createdAt: string;
  isActive: boolean;
}

interface NewKeywordCategory {
  category: string;
  subcategory: string;
  keywords: string;
  description: string;
}

export default function LineItemClassification() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [lineItem, setLineItem] = useState<LineItem>({
    description: "",
    quantity: undefined,
    unitPrice: undefined,
    totalPrice: undefined,
    unit: "",
    rawText: "",
  });

  const [vendorContext, setVendorContext] = useState<VendorContext>({
    vendorName: "",
    industry: "",
    businessType: "",
  });

  const [batchItems, setBatchItems] = useState<LineItem[]>([]);
  const [batchText, setBatchText] = useState("");
  const [currentTab, setCurrentTab] = useState("process"); // Default to 'process' tab

  // Invoice processing state
  const [selectedInvoices, setSelectedInvoices] = useState<number[]>([]);
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [processingSessionId, setProcessingSessionId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Keyword management state
  const [keywordCategories, setKeywordCategories] = useState<KeywordCategory[]>(
    [],
  );
  const [isKeywordModalOpen, setIsKeywordModalOpen] = useState(false);
  const [editingKeyword, setEditingKeyword] = useState<KeywordCategory | null>(
    null,
  );
  const [newKeyword, setNewKeyword] = useState<NewKeywordCategory>({
    category: "",
    subcategory: "",
    keywords: "",
    description: "",
  });
  const [isKeywordLoading, setIsKeywordLoading] = useState(false);
  const [projects, setProjects] = useState<Array<{ id: number; name: string }>>(
    [],
  );
  const [selectedProject, setSelectedProject] = useState<string>("all");

  // Additional missing state variables
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceForProcessing[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [classificationResults, setClassificationResults] = useState<any[]>([]);

  // AI keyword suggestions state
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestionSource, setSuggestionSource] = useState<
    "ai" | "fallback" | null
  >(null);

  // Progress tracking state
  const [showProgressTracker, setShowProgressTracker] = useState(false);
  const [progressSessionId, setProgressSessionId] = useState<string>("");

  // Fetch categories
  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ["/api/classification/categories"],
    queryFn: async () => {
      const response = await fetch("/api/classification/categories");
      return response.json();
    },
  });

  // Fetch invoices ready for line item classification
  const {
    data: invoicesData,
    isLoading: invoicesLoading,
    refetch: refetchInvoices,
  } = useQuery<{
    invoices: InvoiceForProcessing[];
    count: number;
  }>({
    queryKey: [
      "/api/invoices",
      { filterProjectId, filterDateFrom, filterDateTo, filterStatus },
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterProjectId && filterProjectId !== "all")
        params.append("projectId", filterProjectId);
      if (filterDateFrom) params.append("dateFrom", filterDateFrom);
      if (filterDateTo) params.append("dateTo", filterDateTo);
      if (filterStatus && filterStatus !== "all")
        params.append("status", filterStatus);

      const response = await fetch(`/api/invoices?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch invoices: ${response.statusText}`);
      }
      const data = await response.json();

      // Transform the data to match expected format
      const transformedInvoices = data.map((invoice: any) => ({
        id: invoice.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber || "N/A",
        vendorName: invoice.vendorName || "Unknown",
        projectId: invoice.projectId,
        projectName: invoice.projectName,
        totalAmount: parseFloat(invoice.totalAmount || "0"),
        currency: invoice.currency || "USD",
        invoiceDate: invoice.invoiceDate,
        status: invoice.status,
        lineItemsExtracted: !!invoice.extractedData?.lineItems,
        hasClassifications: false, // We'll need to check this separately
        uploadedAt: invoice.createdAt,
        lineItemsCount: invoice.extractedData?.lineItems?.length || 0,
        processingStatus: invoice.processingStatus || "pending",
      }));

      return {
        invoices: transformedInvoices,
        count: transformedInvoices.length,
      };
    },
    enabled: currentTab === "process",
  });

  // Single item classification mutation
  const classifyMutation = useMutation({
    mutationFn: async (data: {
      lineItem: LineItem;
      vendorContext: VendorContext;
    }) => {
      const response = await fetch("/api/classification/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data.lineItem,
          vendorContext: data.vendorContext,
        }),
      });
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Classification Complete",
        description: `Classified as ${result.category} with ${(result.confidence * 100).toFixed(1)}% confidence`,
      });
    },
    onError: (error) => {
      toast({
        title: "Classification Failed",
        description: "Unable to classify line item. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Batch classification mutation
  const batchClassifyMutation = useMutation({
    mutationFn: async (data: {
      lineItems: LineItem[];
      vendorContext: VendorContext;
    }) => {
      const response = await fetch("/api/classification/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineItems: data.lineItems,
          vendorContext: data.vendorContext,
        }),
      });
      return response.json();
    },
    onSuccess: (results) => {
      toast({
        title: "Batch Classification Complete",
        description: `Successfully classified ${results.results.length} items`,
      });
    },
    onError: (error) => {
      toast({
        title: "Batch Classification Failed",
        description: "Unable to classify items. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Process invoices mutation
  const processInvoicesMutation = useMutation({
    mutationFn: async ({ invoiceIds, vendorContext, filters }: {
      invoiceIds: number[],
      vendorContext: any,
      filters?: any
    }) => {
      const response = await fetch('/api/process-invoices-line-items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invoiceIds,
          vendorContext,
          filters,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process invoices');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Processing Complete",
        description: data.message,
      });
      setSelectedInvoices([]);

      // Refresh the invoices data after processing
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });

      // Also refetch the invoices to ensure immediate update
      refetchInvoices();
    },
    onError: (error: Error) => {
      toast({
        title: "Processing Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Test classification mutation
  const testMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/classification/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      return response.json();
    },
    onSuccess: (results) => {
      toast({
        title: "Test Complete",
        description: `Tested with ${results.results.length} sample items`,
      });
    },
  });

  const handleSingleClassify = () => {
    if (!lineItem.description.trim()) {
      toast({
        title: "Missing Description",
        description: "Please enter a line item description",
        variant: "destructive",
      });
      return;
    }

    classifyMutation.mutate({ lineItem, vendorContext });
  };

  const handleBatchClassify = () => {
    if (batchItems.length === 0) {
      toast({
        title: "No Items to Classify",
        description: "Please add items to the batch first",
        variant: "destructive",
      });
      return;
    }

    batchClassifyMutation.mutate({ lineItems: batchItems, vendorContext });
  };

  const parseBatchText = () => {
    if (!batchText.trim()) return;

    const lines = batchText.split("\n").filter((line) => line.trim());
    const items: LineItem[] = lines.map((line) => {
      // Simple parsing - can be enhanced
      const parts = line.split("\t"); // Tab-separated
      if (parts.length >= 1) {
        return {
          description: parts[0].trim(),
          quantity: parts[1] ? parseFloat(parts[1]) : undefined,
          unitPrice: parts[2] ? parseFloat(parts[2]) : undefined,
          unit: parts[3]?.trim() || "",
          rawText: line,
        };
      }
      return { description: line.trim(), rawText: line };
    });

    setBatchItems(items);
    setBatchText("");
    toast({
      title: "Items Parsed",
      description: `Added ${items.length} items to batch`,
    });
  };

  const addBatchItem = () => {
    setBatchItems([...batchItems, { description: "", rawText: "" }]);
  };

  const updateBatchItem = (
    index: number,
    field: keyof LineItem,
    value: any,
  ) => {
    const updated = [...batchItems];
    updated[index] = { ...updated[index], [field]: value };
    setBatchItems(updated);
  };

  const removeBatchItem = (index: number) => {
    setBatchItems(batchItems.filter((_, i) => i !== index));
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      materials_supplies: "bg-blue-100 text-blue-800",
      equipment_tools: "bg-green-100 text-green-800",
      services_labor: "bg-purple-100 text-purple-800",
      utilities_facilities: "bg-yellow-100 text-yellow-800",
      food_beverages: "bg-orange-100 text-orange-800",
      transportation_logistics: "bg-red-100 text-red-800",
      technology_software: "bg-indigo-100 text-indigo-800",
      marketing_advertising: "bg-pink-100 text-pink-800",
      other: "bg-gray-100 text-gray-800",
    };
    return colors[category] || colors.other;
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case "ai":
        return <Brain className="h-4 w-4" />;
      case "keyword":
        return <Tag className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const loadInvoices = async () => {
    try {
      setIsLoading(true);
      let url = "/api/invoices";
      const params = new URLSearchParams();

      if (selectedProject && selectedProject !== "all") {
        params.append("projectId", selectedProject);
      }

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to load invoices");
      }
      const data = await response.json();

      // Transform data to match expected format
      const transformedInvoices = data.map((invoice: any) => ({
        id: invoice.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber || "N/A",
        vendorName: invoice.vendorName || "Unknown",
        projectId: invoice.projectId,
        projectName: invoice.projectName,
        totalAmount: parseFloat(invoice.totalAmount || "0"),
        currency: invoice.currency || "USD",
        invoiceDate: invoice.invoiceDate,
        status: invoice.status,
        lineItemsExtracted: !!invoice.extractedData?.lineItems,
        hasClassifications: false,
        uploadedAt: invoice.createdAt,
        lineItemsCount: invoice.extractedData?.lineItems?.length || 0,
        processingStatus: invoice.processingStatus || "pending",
      }));

      setInvoices(transformedInvoices);
    } catch (error) {
      console.error("Error loading invoices:", error);
      toast({
        title: "Error",
        description: "Failed to load invoices for classification",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadProjects = async () => {
    try {
      const response = await fetch("/api/projects");
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      }
    } catch (error) {
      console.error("Error loading projects:", error);
    }
  };

  const loadKeywordCategories = async () => {
    try {
      setIsKeywordLoading(true);
      const response = await fetch("/api/classification/keywords");
      if (!response.ok) {
        throw new Error("Failed to load keyword categories");
      }
      const data = await response.json();
      setKeywordCategories(data);
    } catch (error) {
      console.error("Error loading keyword categories:", error);
      toast({
        title: "Error",
        description: "Failed to load keyword categories",
        variant: "destructive",
      });
    } finally {
      setIsKeywordLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
    loadProjects();
    loadKeywordCategories();
  }, []);

  useEffect(() => {
    loadInvoices();
  }, [selectedProject]);

  const processSelectedInvoices = async () => {
    if (selectedInvoices.length === 0) {
      toast({
        title: "No Selection",
        description: "Please select invoices to process",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      for (const invoiceId of selectedInvoices) {
        const response = await fetch("/api/classify-line-items", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ invoiceId }),
        });

        if (!response.ok) {
          throw new Error(`Failed to process invoice ${invoiceId}`);
        }

        const result = await response.json();

        // Add to results
        const newBatch: ClassificationBatch = {
          id: `batch-${Date.now()}-${invoiceId}`,
          invoiceId,
          results: result.classifications || [],
          processedAt: new Date().toISOString(),
          totalItems: result.totalItems || 0,
          classifiedItems: result.classifiedItems || 0,
        };

        setClassificationResults((prev) => [newBatch, ...prev]);
      }

      toast({
        title: "Success",
        description: `Processed ${selectedInvoices.length} invoice(s) successfully`,
      });

      setSelectedInvoices([]);
      loadInvoices(); // Reload to update hasClassifications status
    } catch (error) {
      console.error("Error processing invoices:", error);
      toast({
        title: "Error",
        description: "Failed to process some invoices",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const saveKeywordCategory = async () => {
    try {
      const keywordsArray = newKeyword.keywords
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

      if (!newKeyword.category || keywordsArray.length === 0) {
        toast({
          title: "Validation Error",
          description: "Category and at least one keyword are required",
          variant: "destructive",
        });
        return;
      }

      const url = editingKeyword
        ? `/api/classification/keywords/${editingKeyword.id}`
        : "/api/classification/keywords";

      const method = editingKeyword ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category: newKeyword.category,
          subcategory: newKeyword.subcategory || null,
          keywords: keywordsArray,
          description: newKeyword.description || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to save keyword category");
      }

      toast({
        title: "Success",
        description: editingKeyword
          ? "Keyword category updated successfully"
          : "Keyword category created successfully",
      });

      setIsKeywordModalOpen(false);
      setEditingKeyword(null);
      setNewKeyword({
        category: "",
        subcategory: "",
        keywords: "",
        description: "",
      });
      setAiSuggestions([]);
      setSuggestionSource(null);
      loadKeywordCategories();
    } catch (error) {
      console.error("Error saving keyword category:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to save keyword category",
        variant: "destructive",
      });
    }
  };

  const editKeywordCategory = (keyword: KeywordCategory) => {
    setEditingKeyword(keyword);
    setNewKeyword({
      category: keyword.category,
      subcategory: keyword.subcategory || "",
      keywords: keyword.keywords.join(", "),
      description: keyword.description || "",
    });
    setAiSuggestions([]);
    setSuggestionSource(null);
    setIsKeywordModalOpen(true);
  };

  const deleteKeywordCategory = async (id: number) => {
    if (!confirm("Are you sure you want to delete this keyword category?")) {
      return;
    }

    try {
      const response = await fetch(`/api/classification/keywords/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete keyword category");
      }

      toast({
        title: "Success",
        description: "Keyword category deleted successfully",
      });

      loadKeywordCategories();
    } catch (error) {
      console.error("Error deleting keyword category:", error);
      toast({
        title: "Error",
        description: "Failed to delete keyword category",
        variant: "destructive",
      });
    }
  };

  // AI keyword suggestions function
  const getAISuggestions = async () => {
    if (!newKeyword.category.trim()) {
      toast({
        title: "Category Required",
        description: "Please enter a category before getting AI suggestions",
        variant: "destructive",
      });
      return;
    }

    setIsLoadingSuggestions(true);
    setAiSuggestions([]);
    setSuggestionSource(null);

    try {
      const existingKeywords = newKeyword.keywords
        ? newKeyword.keywords
            .split(",")
            .map((k) => k.trim())
            .filter((k) => k)
        : [];

      const response = await fetch("/api/ai/suggest-keywords", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category: newKeyword.category,
          subcategory: newKeyword.subcategory || null,
          business_context: "Colombian construction and procurement",
          language: "Spanish",
          existing_keywords: existingKeywords,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get keyword suggestions");
      }

      const data = await response.json();
      setAiSuggestions(data.suggestions || []);
      setSuggestionSource(data.source || "ai");

      toast({
        title: "Suggestions Generated",
        description: `Got ${data.suggestions?.length || 0} keyword suggestions from ${data.source === "ai" ? "AI" : "fallback"}`,
      });
    } catch (error) {
      console.error("Error getting AI suggestions:", error);
      toast({
        title: "Error",
        description: "Failed to get keyword suggestions. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  // Add selected suggestion to keywords
  const addSuggestionToKeywords = (suggestion: string) => {
    const currentKeywords = newKeyword.keywords
      ? newKeyword.keywords
          .split(",")
          .map((k) => k.trim())
          .filter((k) => k)
      : [];

    if (!currentKeywords.includes(suggestion)) {
      const updatedKeywords = [...currentKeywords, suggestion].join(", ");
      setNewKeyword({ ...newKeyword, keywords: updatedKeywords });

      // Remove from suggestions to avoid duplication
      setAiSuggestions((prev) => prev.filter((s) => s !== suggestion));
    }
  };

  const filteredInvoices = (invoicesData?.invoices || []).filter((invoice) => {
    const matchesSearch =
      searchTerm === "" ||
      invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.vendorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (invoice.projectName || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase());

    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "classified" && invoice.hasClassifications) ||
      (filterStatus === "unclassified" && !invoice.hasClassifications);

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Line Item Classification</h1>
            <p className="text-muted-foreground">
              AI-powered classification of invoice line items for procurement
              categorization
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
            >
              {testMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              <TrendingUp className="h-4 w-4 mr-2" />
              Test System
            </Button>
          </div>
        </div>

        <Tabs
          value={currentTab}
          onValueChange={setCurrentTab}
          className="space-y-6"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="process">Process Invoices</TabsTrigger>
            <TabsTrigger value="keywords">Manage Keywords</TabsTrigger>
            <TabsTrigger value="results">Results & History</TabsTrigger>
          </TabsList>

          {/* Vendor Context Card - Kept as it might be relevant for future functionality */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Vendor Context</CardTitle>
              <CardDescription>
                Provide vendor information to improve classification accuracy
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vendorName">Vendor Name</Label>
                  <Input
                    id="vendorName"
                    value={vendorContext.vendorName || ""}
                    onChange={(e) =>
                      setVendorContext({
                        ...vendorContext,
                        vendorName: e.target.value,
                      })
                    }
                    placeholder="e.g., ACME Construction"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Input
                    id="industry"
                    value={vendorContext.industry || ""}
                    onChange={(e) =>
                      setVendorContext({
                        ...vendorContext,
                        industry: e.target.value,
                      })
                    }
                    placeholder="e.g., Construction, Manufacturing"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessType">Business Type</Label>
                  <Input
                    id="businessType"
                    value={vendorContext.businessType || ""}
                    onChange={(e) =>
                      setVendorContext({
                        ...vendorContext,
                        businessType: e.target.value,
                      })
                    }
                    placeholder="e.g., Supplier, Service Provider"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Process Invoices Content */}
          <TabsContent value="process">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Select Invoices to Process
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <Label htmlFor="search">Search Invoices</Label>
                      <Input
                        id="search"
                        placeholder="Search by invoice number or vendor..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <div className="w-48">
                      <Label htmlFor="project-filter">Filter by Project</Label>
                      <Select
                        value={selectedProject}
                        onValueChange={setSelectedProject}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="All Projects" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Projects</SelectItem>
                          {projects.map((project) => (
                            <SelectItem
                              key={project.id}
                              value={project.id.toString()}
                            >
                              {project.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-48">
                      <Label htmlFor="status-filter">
                        Classification Status
                      </Label>
                      <Select
                        value={filterStatus}
                        onValueChange={setFilterStatus}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Invoices</SelectItem>
                          <SelectItem value="classified">
                            Already Classified
                          </SelectItem>
                          <SelectItem value="unclassified">
                            Not Classified
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="flex space-x-4 my-6">
                  <Button
                    onClick={() => refetchInvoices()}
                    variant="outline"
                    className="border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    <RefreshCcw className="h-4 w-4 mr-2" />
                    Refresh Invoices
                  </Button>
                  <Button
                    onClick={() => {
                      if (selectedInvoices.length > 0) {
                        processInvoicesMutation.mutate({
                          invoiceIds: selectedInvoices,
                          vendorContext: vendorContext,
                        });
                      } else {
                        processInvoicesMutation.mutate({
                          invoiceIds: [],
                          vendorContext: vendorContext,
                          filters: {
                            filterProjectId,
                            filterDateFrom,
                            filterDateTo,
                            filterStatus,
                          },
                        });
                      }
                    }}
                    disabled={processInvoicesMutation.isPending}
                  >
                    {processInvoicesMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileCheck className="h-4 w-4 mr-2" />
                    )}
                    {selectedInvoices.length > 0
                      ? `Process ${selectedInvoices.length} Selected`
                      : "Process All Filtered"}
                  </Button>
                </div>

                {/* Progress Tracker */}
                {showProgressTracker && progressSessionId && (
                  <div className="my-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Processing Progress</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <Progress value={50} />
                          <p className="text-sm text-muted-foreground">
                            Processing session: {progressSessionId}
                          </p>
                          <Button onClick={() => setShowProgressTracker(false)}>
                            Close
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {invoicesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="ml-2">Loading invoices...</span>
                  </div>
                ) : filteredInvoices.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <input
                              type="checkbox"
                              checked={
                                selectedInvoices.length ===
                                  filteredInvoices.length &&
                                filteredInvoices.length > 0
                              }
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedInvoices(
                                    filteredInvoices
                                      .map((inv) => inv.invoiceId || inv.id)
                                      .filter((id) => id !== undefined),
                                  );
                                } else {
                                  setSelectedInvoices([]);
                                }
                              }}
                            />
                          </TableHead>
                          <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Invoice Number
                          </TableHead>
                          <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Vendor
                          </TableHead>
                          <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Project
                          </TableHead>
                          <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Amount
                          </TableHead>
                          <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Line Items
                          </TableHead>
                          <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Classification Status
                          </TableHead>
                          <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredInvoices.map((invoice) => (
                          <TableRow
                            key={invoice.invoiceId || invoice.id}
                            className="hover:bg-gray-50"
                          >
                            <TableCell className="px-6 py-4 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={selectedInvoices.includes(
                                  invoice.invoiceId || invoice.id,
                                )}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    const invoiceId =
                                      invoice.invoiceId || invoice.id;
                                    setSelectedInvoices([
                                      ...selectedInvoices,
                                      invoiceId,
                                    ]);
                                  } else {
                                    const invoiceId =
                                      invoice.invoiceId || invoice.id;
                                    setSelectedInvoices(
                                      selectedInvoices.filter(
                                        (id) => id !== invoiceId,
                                      ),
                                    );
                                  }
                                }}
                                className="rounded border-gray-300"
                              />
                            </TableCell>
                            <TableCell className="px-6 py-4 whitespace-nowrap font-medium">
                              {invoice.invoiceNumber}
                            </TableCell>
                            <TableCell className="px-6 py-4 whitespace-nowrap">
                              {invoice.vendorName}
                            </TableCell>
                            <TableCell className="px-6 py-4 whitespace-nowrap">
                              {invoice.projectName || "N/A"}
                            </TableCell>
                            <TableCell className="px-6 py-4 whitespace-nowrap">
                              ${invoice.totalAmount.toLocaleString()}
                            </TableCell>
                            <TableCell className="px-6 py-4 whitespace-nowrap">
                              {invoice.lineItemsCount}
                            </TableCell>
                            <TableCell className="px-6 py-4 whitespace-nowrap">
                              <Badge
                                variant={
                                  invoice.hasClassifications
                                    ? "default"
                                    : "secondary"
                                }
                              >
                                {invoice.hasClassifications
                                  ? "Classified"
                                  : "Not Classified"}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {invoice.uploadedAt
                                ? new Date(
                                    invoice.uploadedAt,
                                  ).toLocaleDateString()
                                : "N/A"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <Alert>
                    <AlertDescription>
                      No invoices found matching your criteria. Try adjusting
                      the filters above.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="keywords">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Classification Keywords
                  </div>
                  <Dialog
                    open={isKeywordModalOpen}
                    onOpenChange={setIsKeywordModalOpen}
                  >
                    <DialogTrigger asChild>
                      <Button
                        onClick={() => {
                          setEditingKeyword(null);
                          setNewKeyword({
                            category: "",
                            subcategory: "",
                            keywords: "",
                            description: "",
                          });
                          setAiSuggestions([]);
                          setSuggestionSource(null);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Keywords
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>
                          {editingKeyword
                            ? "Edit Keyword Category"
                            : "Add New Keyword Category"}
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="category">Category *</Label>
                            <Input
                              id="category"
                              value={newKeyword.category}
                              onChange={(e) =>
                                setNewKeyword({
                                  ...newKeyword,
                                  category: e.target.value,
                                })
                              }
                              placeholder="e.g., materials_supplies"
                            />
                          </div>
                          <div>
                            <Label htmlFor="subcategory">Subcategory</Label>
                            <Input
                              id="subcategory"
                              value={newKeyword.subcategory}
                              onChange={(e) =>
                                setNewKeyword({
                                  ...newKeyword,
                                  subcategory: e.target.value,
                                })
                              }
                              placeholder="e.g., construction"
                            />
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="keywords">
                            Keywords * (comma-separated)
                          </Label>
                          <Textarea
                            id="keywords"
                            value={newKeyword.keywords}
                            onChange={(e) =>
                              setNewKeyword({
                                ...newKeyword,
                                keywords: e.target.value,
                              })
                            }
                            placeholder="cement, concrete, steel, lumber, paint"
                            rows={3}
                          />
                        </div>

                        {/* AI Keyword Suggestions Section */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">
                              AI Keyword Suggestions
                            </Label>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={getAISuggestions}
                              disabled={
                                isLoadingSuggestions ||
                                !newKeyword.category.trim()
                              }
                            >
                              {isLoadingSuggestions ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Generating...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-4 w-4 mr-2" />
                                  Get Suggestions
                                </>
                              )}
                            </Button>
                          </div>

                          {aiSuggestions.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Bot className="h-3 w-3" />
                                {suggestionSource === "ai"
                                  ? "AI-generated suggestions"
                                  : "Fallback suggestions"}
                                - Click to add to keywords
                              </div>
                              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto p-2 border rounded-md bg-muted/50">
                                {aiSuggestions.map((suggestion, index) => (
                                  <Badge
                                    key={index}
                                    variant="secondary"
                                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                                    onClick={() =>
                                      addSuggestionToKeywords(suggestion)
                                    }
                                  >
                                    {suggestion}
                                    <Plus className="h-3 w-3 ml-1" />
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {isLoadingSuggestions && (
                            <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Generating keyword suggestions...
                            </div>
                          )}
                        </div>
                        <div>
                          <Label htmlFor="description">Description</Label>
                          <Textarea
                            id="description"
                            value={newKeyword.description}
                            onChange={(e) =>
                              setNewKeyword({
                                ...newKeyword,
                                description: e.target.value,
                              })
                            }
                            placeholder="Description of this keyword category"
                            rows={2}
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            onClick={() => setIsKeywordModalOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button onClick={saveKeywordCategory}>
                            {editingKeyword ? "Update" : "Create"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isKeywordLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <span className="ml-2">Loading keywords...</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {keywordCategories.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <Database className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                        <p>No keyword categories found</p>
                        <p className="text-sm">
                          Add some keywords to start classifying line items
                        </p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Category</TableHead>
                            <TableHead>Subcategory</TableHead>
                            <TableHead>Keywords Count</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {keywordCategories.map((keyword) => (
                            <TableRow key={keyword.id}>
                              <TableCell className="font-medium">
                                {keyword.category
                                  .replace(/_/g, " ")
                                  .toUpperCase()}
                              </TableCell>
                              <TableCell>
                                {keyword.subcategory
                                  ? keyword.subcategory.replace(/_/g, " ")
                                  : "-"}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">
                                  {keyword.keywords.length} keywords
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-xs truncate">
                                {keyword.description || "-"}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => editKeywordCategory(keyword)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      deleteKeywordCategory(keyword.id)
                                    }
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="results">
            <Card>
              <CardHeader>
                <CardTitle>Available Categories</CardTitle>
                <CardDescription>
                  Supported classification categories
                </CardDescription>
              </CardHeader>
              <CardContent>
                {categoriesLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="ml-2">Loading categories...</span>
                  </div>
                ) : categories ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(categories).map(
                      ([category, description]) => (
                        <div
                          key={category}
                          className="border rounded p-3 space-y-2"
                        >
                          <Badge className={getCategoryColor(category)}>
                            {category.replace("_", " ").toUpperCase()}
                          </Badge>
                          <p className="text-sm text-muted-foreground">
                            {String(description)}
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <Alert>
                    <AlertDescription>
                      Unable to load categories. Please refresh the page.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {testMutation.data && (
              <Card>
                <CardHeader>
                  <CardTitle>Test Results</CardTitle>
                  <CardDescription>
                    Results from the most recent system test
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Confidence</TableHead>
                        <TableHead>Method</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {testMutation.data.results.map(
                        (result: any, index: number) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">
                              {result.item.description}
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={getCategoryColor(
                                  result.classification.category,
                                )}
                              >
                                {result.classification.category.replace(
                                  "_",
                                  " ",
                                )}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {(result.classification.confidence * 100).toFixed(
                                1,
                              )}
                              %
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                {getMethodIcon(result.classification.method)}
                                <span>{result.classification.method}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ),
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}