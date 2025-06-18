
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  Trash2, 
  Upload, 
  Download, 
  Settings, 
  Tag, 
  Wrench, 
  HardHat, 
  Package,
  Users,
  RefreshCw,
  Check,
  AlertCircle
} from "lucide-react";

interface ClassificationKeywords {
  consumable_materials: { id: number; keyword: string; isDefault: boolean }[];
  non_consumable_materials: { id: number; keyword: string; isDefault: boolean }[];
  labor: { id: number; keyword: string; isDefault: boolean }[];
  tools_equipment: { id: number; keyword: string; isDefault: boolean }[];
}

const CATEGORY_INFO = {
  consumable_materials: {
    label: "Consumable Materials",
    icon: Package,
    color: "bg-blue-100 text-blue-800",
    description: "Materials that are used up during construction/operations"
  },
  non_consumable_materials: {
    label: "Non-Consumable Materials", 
    icon: Settings,
    color: "bg-green-100 text-green-800",
    description: "Durable materials and equipment that are reusable"
  },
  labor: {
    label: "Labor",
    icon: Users,
    color: "bg-purple-100 text-purple-800", 
    description: "Human resources and professional services"
  },
  tools_equipment: {
    label: "Tools & Equipment",
    icon: Wrench,
    color: "bg-orange-100 text-orange-800",
    description: "Tools, machinery, and equipment"
  }
};

export default function LineItemClassification() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeCategory, setActiveCategory] = useState("consumable_materials");
  const [newKeyword, setNewKeyword] = useState("");
  const [bulkKeywords, setBulkKeywords] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<number | null>(null);

  // Fetch classification keywords
  const { data: keywords = {} as ClassificationKeywords } = useQuery<ClassificationKeywords>({
    queryKey: ["/api/classification/keywords"],
  });

  // Fetch invoices for classification testing
  const { data: invoices = [] } = useQuery({
    queryKey: ["/api/invoices"],
  });

  // Fetch line item classifications for selected invoice
  const { data: lineItemClassifications = [] } = useQuery({
    queryKey: ["/api/invoices", selectedInvoice, "classifications"],
    enabled: !!selectedInvoice,
  });

  // Add keyword mutation
  const addKeywordMutation = useMutation({
    mutationFn: async ({ category, keyword }: { category: string; keyword: string }) => {
      const response = await fetch("/api/classification/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, keyword }),
      });
      if (!response.ok) throw new Error("Failed to add keyword");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classification/keywords"] });
      setNewKeyword("");
      toast({
        title: "Success",
        description: "Keyword added successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add keyword",
        variant: "destructive",
      });
    },
  });

  // Remove keyword mutation
  const removeKeywordMutation = useMutation({
    mutationFn: async (keywordId: number) => {
      const response = await fetch(`/api/classification/keywords/${keywordId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to remove keyword");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classification/keywords"] });
      toast({
        title: "Success",
        description: "Keyword removed successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove keyword",
        variant: "destructive",
      });
    },
  });

  // Bulk add keywords mutation
  const bulkAddMutation = useMutation({
    mutationFn: async ({ category, keywords }: { category: string; keywords: string[] }) => {
      const response = await fetch("/api/classification/keywords/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, keywords }),
      });
      if (!response.ok) throw new Error("Failed to bulk add keywords");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classification/keywords"] });
      setBulkKeywords("");
      toast({
        title: "Success",
        description: "Keywords added successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to bulk add keywords",
        variant: "destructive",
      });
    },
  });

  // Auto-classify mutation
  const autoClassifyMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const response = await fetch(`/api/invoices/${invoiceId}/auto-classify`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to auto-classify");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", selectedInvoice, "classifications"] });
      toast({
        title: "Success",
        description: "Auto-classification completed",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to auto-classify invoice",
        variant: "destructive",
      });
    },
  });

  // Manual classification update mutation
  const updateClassificationMutation = useMutation({
    mutationFn: async ({ lineItemId, category }: { lineItemId: number; category: string }) => {
      const response = await fetch(`/api/invoices/${selectedInvoice}/line-items/${lineItemId}/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      if (!response.ok) throw new Error("Failed to update classification");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", selectedInvoice, "classifications"] });
      toast({
        title: "Success",
        description: "Classification updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error", 
        description: "Failed to update classification",
        variant: "destructive",
      });
    },
  });

  const handleAddKeyword = () => {
    if (newKeyword.trim()) {
      addKeywordMutation.mutate({
        category: activeCategory,
        keyword: newKeyword.trim(),
      });
    }
  };

  const handleBulkAdd = () => {
    if (bulkKeywords.trim()) {
      const keywordList = bulkKeywords
        .split(/[,\n]/)
        .map(k => k.trim())
        .filter(k => k.length > 0);
      
      if (keywordList.length > 0) {
        bulkAddMutation.mutate({
          category: activeCategory,
          keywords: keywordList,
        });
      }
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        let keywordList: string[] = [];

        if (file.name.endsWith('.json')) {
          const data = JSON.parse(text);
          keywordList = Array.isArray(data) ? data : data[activeCategory] || [];
        } else if (file.name.endsWith('.csv')) {
          keywordList = text.split(/[,\n]/).map(k => k.trim()).filter(k => k.length > 0);
        }

        if (keywordList.length > 0) {
          bulkAddMutation.mutate({
            category: activeCategory,
            keywords: keywordList,
          });
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to parse file",
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);
  };

  const exportKeywords = () => {
    const categoryKeywords = keywords[activeCategory as keyof ClassificationKeywords] || [];
    const userKeywords = categoryKeywords.filter(k => !k.isDefault);
    
    const data = {
      category: activeCategory,
      keywords: userKeywords.map(k => k.keyword),
      exportDate: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeCategory}_keywords.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Line Item Classification</h1>
          <p className="text-gray-600 mt-2">
            Manage classification keywords and categorize invoice line items
          </p>
        </div>

        <Tabs defaultValue="keywords" className="space-y-6">
          <TabsList>
            <TabsTrigger value="keywords">Keyword Management</TabsTrigger>
            <TabsTrigger value="classify">Classify Line Items</TabsTrigger>
          </TabsList>

          {/* Keyword Management Tab */}
          <TabsContent value="keywords">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Category Selection */}
              <div className="lg:col-span-1">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Tag className="w-5 h-5" />
                      Categories
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {Object.entries(CATEGORY_INFO).map(([key, info]) => {
                      const Icon = info.icon;
                      return (
                        <div
                          key={key}
                          onClick={() => setActiveCategory(key)}
                          className={`p-3 rounded-lg cursor-pointer border-2 transition-all ${
                            activeCategory === key
                              ? "border-primary-500 bg-primary-50"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Icon className="w-5 h-5" />
                            <div>
                              <div className="font-medium">{info.label}</div>
                              <div className="text-sm text-gray-500">{info.description}</div>
                            </div>
                          </div>
                          <div className="mt-2">
                            <Badge variant="secondary">
                              {keywords[key as keyof ClassificationKeywords]?.length || 0} keywords
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>

              {/* Keyword Management */}
              <div className="lg:col-span-2 space-y-6">
                {/* Add Keywords */}
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Add Keywords - {CATEGORY_INFO[activeCategory as keyof typeof CATEGORY_INFO].label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Single Keyword */}
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter keyword..."
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && handleAddKeyword()}
                      />
                      <Button onClick={handleAddKeyword} disabled={!newKeyword.trim()}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add
                      </Button>
                    </div>

                    {/* Bulk Keywords */}
                    <div className="space-y-2">
                      <Label>Bulk Add (comma or line separated)</Label>
                      <Textarea
                        placeholder="keyword1, keyword2, keyword3..."
                        value={bulkKeywords}
                        onChange={(e) => setBulkKeywords(e.target.value)}
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={handleBulkAdd} disabled={!bulkKeywords.trim()}>
                          <Plus className="w-4 h-4 mr-2" />
                          Bulk Add
                        </Button>
                        <label className="cursor-pointer">
                          <Button variant="outline" asChild>
                            <span>
                              <Upload className="w-4 h-4 mr-2" />
                              Upload File
                            </span>
                          </Button>
                          <input
                            type="file"
                            accept=".csv,.json"
                            onChange={handleFileUpload}
                            className="hidden"
                          />
                        </label>
                        <Button variant="outline" onClick={exportKeywords}>
                          <Download className="w-4 h-4 mr-2" />
                          Export
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Current Keywords */}
                <Card>
                  <CardHeader>
                    <CardTitle>Current Keywords</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Default Keywords */}
                      <div>
                        <h4 className="font-medium text-gray-700 mb-2">Default Keywords</h4>
                        <div className="flex flex-wrap gap-2">
                          {keywords[activeCategory as keyof ClassificationKeywords]
                            ?.filter(k => k.isDefault)
                            .map((keyword) => (
                              <Badge key={keyword.id} variant="secondary">
                                {keyword.keyword}
                              </Badge>
                            ))}
                        </div>
                      </div>

                      {/* Custom Keywords */}
                      <div>
                        <h4 className="font-medium text-gray-700 mb-2">Custom Keywords</h4>
                        <div className="flex flex-wrap gap-2">
                          {keywords[activeCategory as keyof ClassificationKeywords]
                            ?.filter(k => !k.isDefault)
                            .map((keyword) => (
                              <Badge 
                                key={keyword.id} 
                                variant="default"
                                className="flex items-center gap-1"
                              >
                                {keyword.keyword}
                                <button
                                  onClick={() => removeKeywordMutation.mutate(keyword.id)}
                                  className="ml-1 hover:text-red-400"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </Badge>
                            ))}
                        </div>
                        {keywords[activeCategory as keyof ClassificationKeywords]
                          ?.filter(k => !k.isDefault).length === 0 && (
                          <p className="text-gray-500 text-sm">No custom keywords added yet</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Classify Line Items Tab */}
          <TabsContent value="classify">
            <div className="space-y-6">
              {/* Invoice Selection */}
              <Card>
                <CardHeader>
                  <CardTitle>Select Invoice</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4 items-end">
                    <div className="flex-1">
                      <Label>Invoice</Label>
                      <Select value={selectedInvoice?.toString() || ""} onValueChange={(value) => setSelectedInvoice(parseInt(value))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an invoice" />
                        </SelectTrigger>
                        <SelectContent>
                          {invoices.map((invoice: any) => (
                            <SelectItem key={invoice.id} value={invoice.id.toString()}>
                              {invoice.fileName} - {invoice.vendorName || 'Unknown Vendor'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={() => selectedInvoice && autoClassifyMutation.mutate(selectedInvoice)}
                      disabled={!selectedInvoice}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Auto-Classify
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Line Items Classification */}
              {selectedInvoice && (
                <Card>
                  <CardHeader>
                    <CardTitle>Line Item Classifications</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Description</TableHead>
                          <TableHead>Quantity</TableHead>
                          <TableHead>Unit Price</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Matched Keyword</TableHead>
                          <TableHead>Confidence</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lineItemClassifications.map((item: any) => (
                          <TableRow key={item.lineItemId}>
                            <TableCell>{item.description}</TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>${item.unitPrice}</TableCell>
                            <TableCell>${item.totalPrice}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {item.category ? (
                                  <Badge className={CATEGORY_INFO[item.category as keyof typeof CATEGORY_INFO]?.color}>
                                    {CATEGORY_INFO[item.category as keyof typeof CATEGORY_INFO]?.label}
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">Unclassified</Badge>
                                )}
                                {item.isManualOverride && (
                                  <Badge variant="outline" className="text-xs">
                                    Manual
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {item.matchedKeyword && (
                                <Badge variant="outline" className="text-xs">
                                  {item.matchedKeyword}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {item.confidence && (
                                <div className="flex items-center gap-1">
                                  <span className="text-sm">{Math.round(parseFloat(item.confidence) * 100)}%</span>
                                  {parseFloat(item.confidence) > 0.7 ? (
                                    <Check className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <AlertCircle className="w-4 h-4 text-yellow-500" />
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Select
                                value={item.category || ""}
                                onValueChange={(category) => updateClassificationMutation.mutate({
                                  lineItemId: item.lineItemId,
                                  category
                                })}
                              >
                                <SelectTrigger className="w-40">
                                  <SelectValue placeholder="Classify" />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(CATEGORY_INFO).map(([key, info]) => (
                                    <SelectItem key={key} value={key}>
                                      {info.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
