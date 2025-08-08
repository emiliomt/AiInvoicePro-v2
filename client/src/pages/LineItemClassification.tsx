import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Brain, Package, Wrench, Users, Building, Coffee, Truck, Monitor, Megaphone, HelpCircle, TestTube, FileSpreadsheet, BarChart3, Loader2 } from "lucide-react";

interface ClassificationResult {
  category: string;
  matchedKeywords: string[];
  confidence: number;
  method: string;
  reasoning?: string;
  isManualOverride: boolean;
}

interface LineItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  unit?: string;
  rawText?: string;
}

interface Category {
  value: string;
  label: string;
}

const categoryIcons: Record<string, any> = {
  materials_supplies: Package,
  equipment_tools: Wrench,
  services_labor: Users,
  utilities_facilities: Building,
  food_beverages: Coffee,
  transportation_logistics: Truck,
  technology_software: Monitor,
  marketing_advertising: Megaphone,
  other: HelpCircle,
};

export default function LineItemClassification() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [singleItem, setSingleItem] = useState<LineItem>({
    description: "",
    quantity: undefined,
    unitPrice: undefined,
    totalPrice: undefined,
    unit: "",
    rawText: "",
  });
  const [useAI, setUseAI] = useState(false);
  const [batchItems, setBatchItems] = useState<string>("");

  // Fetch available categories
  const { data: categories = [], isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/classification/categories"],
  });

  // Fetch classification stats
  const { data: stats = {}, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/classification/stats"],
  });

  // Single item classification mutation
  const classifyMutation = useMutation({
    mutationFn: async (data: LineItem & { useAI: boolean }) => {
      const response = await fetch("/api/classification/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Classification failed");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classification/stats"] });
    },
  });

  // Batch classification mutation
  const batchClassifyMutation = useMutation({
    mutationFn: async (data: { items: LineItem[]; useAI: boolean }) => {
      const response = await fetch("/api/classification/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Batch classification failed");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classification/stats"] });
    },
  });

  // Test classification mutation
  const testMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/classification/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error("Test failed");
      return response.json();
    },
  });

  const handleSingleClassification = () => {
    if (!singleItem.description.trim()) {
      toast({
        title: "Error",
        description: "Description is required",
        variant: "destructive",
      });
      return;
    }

    classifyMutation.mutate({
      ...singleItem,
      useAI,
    });
  };

  const handleBatchClassification = () => {
    try {
      const lines = batchItems.split('\n').filter(line => line.trim());
      const items: LineItem[] = lines.map(line => ({
        description: line.trim(),
      }));

      if (items.length === 0) {
        toast({
          title: "Error",
          description: "Please enter line items to classify",
          variant: "destructive",
        });
        return;
      }

      batchClassifyMutation.mutate({
        items,
        useAI,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to parse batch items",
        variant: "destructive",
      });
    }
  };

  const handleRunTest = () => {
    testMutation.mutate();
  };

  const renderClassificationResult = (result: ClassificationResult) => {
    const CategoryIcon = categoryIcons[result.category] || HelpCircle;
    const category = (categories as Category[]).find((c: Category) => c.value === result.category);
    
    return (
      <div className="p-4 border rounded-lg bg-muted/30">
        <div className="flex items-center gap-2 mb-2">
          <CategoryIcon className="h-5 w-5" />
          <span className="font-medium">{category?.label || result.category}</span>
          <Badge variant={result.method === 'ai' ? 'default' : 'secondary'}>
            {result.method.toUpperCase()}
          </Badge>
        </div>
        <div className="text-sm text-muted-foreground space-y-1">
          <div>Confidence: {(result.confidence * 100).toFixed(1)}%</div>
          {result.matchedKeywords.length > 0 && (
            <div>
              Keywords: {result.matchedKeywords.join(', ')}
            </div>
          )}
          {result.reasoning && (
            <div>Reasoning: {result.reasoning}</div>
          )}
        </div>
      </div>
    );
  };

  const getCategoryLabel = (value: string) => {
    const category = (categories as Category[]).find((c: Category) => c.value === value);
    return category?.label || value;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Brain className="h-8 w-8" />
        <div>
          <h1 className="text-3xl font-bold">Line Item Classification</h1>
          <p className="text-muted-foreground">
            Classify invoice line items using AI or keyword-based matching
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Classification Interface */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="single" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="single">Single Item</TabsTrigger>
              <TabsTrigger value="batch">Batch Classification</TabsTrigger>
              <TabsTrigger value="test">Test Classification</TabsTrigger>
            </TabsList>

            {/* AI Toggle */}
            <div className="flex items-center gap-2 p-4 bg-muted/30 rounded-lg">
              <Switch 
                id="ai-mode" 
                checked={useAI} 
                onCheckedChange={setUseAI}
              />
              <Label htmlFor="ai-mode" className="flex items-center gap-2">
                <Brain className="h-4 w-4" />
                Use AI Classification
                {useAI && <Badge variant="outline">Requires OpenAI API</Badge>}
              </Label>
            </div>

            <TabsContent value="single">
              <Card>
                <CardHeader>
                  <CardTitle>Single Item Classification</CardTitle>
                  <CardDescription>
                    Classify a single line item from an invoice
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <Label htmlFor="description">Description *</Label>
                      <Textarea
                        id="description"
                        placeholder="Enter line item description..."
                        value={singleItem.description}
                        onChange={(e) => setSingleItem({ ...singleItem, description: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="quantity">Quantity</Label>
                      <Input
                        id="quantity"
                        type="number"
                        placeholder="Quantity"
                        value={singleItem.quantity || ""}
                        onChange={(e) => setSingleItem({ ...singleItem, quantity: parseFloat(e.target.value) || undefined })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="unit">Unit</Label>
                      <Input
                        id="unit"
                        placeholder="Unit (kg, hours, pieces, etc.)"
                        value={singleItem.unit || ""}
                        onChange={(e) => setSingleItem({ ...singleItem, unit: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="unitPrice">Unit Price</Label>
                      <Input
                        id="unitPrice"
                        type="number"
                        placeholder="Unit price"
                        value={singleItem.unitPrice || ""}
                        onChange={(e) => setSingleItem({ ...singleItem, unitPrice: parseFloat(e.target.value) || undefined })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="totalPrice">Total Price</Label>
                      <Input
                        id="totalPrice"
                        type="number"
                        placeholder="Total price"
                        value={singleItem.totalPrice || ""}
                        onChange={(e) => setSingleItem({ ...singleItem, totalPrice: parseFloat(e.target.value) || undefined })}
                      />
                    </div>
                  </div>

                  <Button 
                    onClick={handleSingleClassification}
                    disabled={classifyMutation.isPending}
                    className="w-full"
                  >
                    {classifyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Classify Item
                  </Button>

                  {classifyMutation.data && (
                    <div className="space-y-2">
                      <h3 className="font-medium">Classification Result:</h3>
                      {renderClassificationResult(classifyMutation.data as ClassificationResult)}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="batch">
              <Card>
                <CardHeader>
                  <CardTitle>Batch Classification</CardTitle>
                  <CardDescription>
                    Classify multiple line items at once (one per line)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="batchItems">Line Items</Label>
                    <Textarea
                      id="batchItems"
                      placeholder="Enter line items, one per line&#10;Example:&#10;Cemento Portland 50kg&#10;Servicios de ingeniería&#10;Laptop Dell Inspiron"
                      rows={8}
                      value={batchItems}
                      onChange={(e) => setBatchItems(e.target.value)}
                    />
                  </div>

                  <Button 
                    onClick={handleBatchClassification}
                    disabled={batchClassifyMutation.isPending}
                    className="w-full"
                  >
                    {batchClassifyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Classify Batch
                  </Button>

                  {(batchClassifyMutation.data as any)?.results && (
                    <div className="space-y-4">
                      <h3 className="font-medium">Batch Results:</h3>
                      {(batchClassifyMutation.data as any).results.map((item: any, index: number) => (
                        <div key={index} className="border rounded-lg p-4">
                          <div className="font-medium mb-2">{item.description}</div>
                          {renderClassificationResult(item.classification as ClassificationResult)}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="test">
              <Card>
                <CardHeader>
                  <CardTitle>Test Classification System</CardTitle>
                  <CardDescription>
                    Run predefined tests to verify the classification system
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button 
                    onClick={handleRunTest}
                    disabled={testMutation.isPending}
                    className="w-full"
                  >
                    {testMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <TestTube className="mr-2 h-4 w-4" />
                    Run Test Suite
                  </Button>

                  {testMutation.data && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="text-green-800">
                          ✅ {(testMutation.data as any).message}
                          {(testMutation.data as any).openai_available && (
                            <Badge variant="outline" className="ml-2">OpenAI Available</Badge>
                          )}
                        </div>
                      </div>
                      
                      {(testMutation.data as any).results?.map((result: any, index: number) => (
                        <div key={index} className="border rounded-lg p-4">
                          <div className="font-medium mb-2">
                            {result.item.description}
                            {result.item.quantity && ` (${result.item.quantity} ${result.item.unit})`}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <h4 className="text-sm font-medium mb-2">Keyword Classification:</h4>
                              {renderClassificationResult(result.keywordClassification as ClassificationResult)}
                            </div>
                            {result.aiClassification && (
                              <div>
                                <h4 className="text-sm font-medium mb-2">AI Classification:</h4>
                                {renderClassificationResult(result.aiClassification as ClassificationResult)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          {/* Categories Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Categories
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {categoriesLoading ? (
                <div className="text-sm text-muted-foreground">Loading categories...</div>
              ) : (
                (categories as Category[]).map((category: Category) => {
                  const CategoryIcon = categoryIcons[category.value] || HelpCircle;
                  return (
                    <div key={category.value} className="flex items-center gap-2 text-sm">
                      <CategoryIcon className="h-4 w-4" />
                      <span>{category.label}</span>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Statistics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {statsLoading ? (
                <div className="text-sm text-muted-foreground">Loading statistics...</div>
              ) : stats && Object.keys(stats).length > 0 ? (
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm">Total Classifications:</span>
                    <span className="font-medium">{(stats as any).total || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Avg Confidence:</span>
                    <span className="font-medium">{(((stats as any).avgConfidence || 0) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Manual Overrides:</span>
                    <span className="font-medium">{(stats as any).manualOverrides || 0}</span>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h4 className="text-sm font-medium mb-2">By Category:</h4>
                    <div className="space-y-1">
                      {Object.entries((stats as any).byCategory || {}).map(([category, count]) => (
                        <div key={category} className="flex justify-between text-xs">
                          <span>{getCategoryLabel(category)}:</span>
                          <span>{count as number}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium mb-2">By Method:</h4>
                    <div className="space-y-1">
                      {Object.entries((stats as any).byMethod || {}).map(([method, count]) => (
                        <div key={method} className="flex justify-between text-xs">
                          <span>{method.toUpperCase()}:</span>
                          <span>{count as number}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No statistics available</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}