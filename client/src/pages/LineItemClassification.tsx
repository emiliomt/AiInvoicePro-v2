import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, TestTube, Upload, FileText, Zap } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import Header from '@/components/Header';

interface ClassificationResult {
  category: string;
  confidence: number;
  matchedKeywords: string[];
  method: 'ai' | 'keyword' | 'hybrid';
  reasoning?: string;
}

interface LineItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  unit?: string;
  rawText?: string;
}

export default function LineItemClassification() {
  const { toast } = useToast();
  const [lineItem, setLineItem] = useState<LineItem>({
    description: '',
    quantity: undefined,
    unitPrice: undefined,
    totalPrice: undefined,
    unit: '',
    rawText: ''
  });
  const [batchItems, setBatchItems] = useState('');
  const [classificationResult, setClassificationResult] = useState<ClassificationResult | null>(null);
  const [batchResults, setBatchResults] = useState<any[] | null>(null);

  // Query for available categories
  const { data: categories } = useQuery({
    queryKey: ['/api/classification/categories'],
  });

  // Single classification mutation
  const classifySingleMutation = useMutation({
    mutationFn: async (data: LineItem) => {
      const response = await apiRequest('/api/classification/classify', data);
      return response;
    },
    onSuccess: (result) => {
      setClassificationResult(result);
      toast({
        title: "Classification Complete",
        description: `Classified as: ${result.category} (${Math.round(result.confidence * 100)}% confidence)`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Classification Failed",
        description: error.message || "Failed to classify line item",
        variant: "destructive",
      });
    },
  });

  // Batch classification mutation
  const classifyBatchMutation = useMutation({
    mutationFn: async (items: LineItem[]) => {
      const response = await apiRequest('/api/classification/batch', { lineItems: items });
      return response;
    },
    onSuccess: (result) => {
      setBatchResults(result.results);
      toast({
        title: "Batch Classification Complete",
        description: `Classified ${result.results.length} items`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Batch Classification Failed",
        description: error.message || "Failed to classify batch items",
        variant: "destructive",
      });
    },
  });

  // Test classification mutation
  const testClassificationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/classification/test', {});
      return response;
    },
    onSuccess: (result) => {
      setBatchResults(result.results);
      toast({
        title: "Test Complete",
        description: `Tested ${result.results.length} sample items`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Test Failed",
        description: error.message || "Failed to run classification test",
        variant: "destructive",
      });
    },
  });

  const handleSingleClassification = () => {
    if (!lineItem.description.trim()) {
      toast({
        title: "Error",
        description: "Description is required",
        variant: "destructive",
      });
      return;
    }
    classifySingleMutation.mutate(lineItem);
  };

  const handleBatchClassification = () => {
    try {
      const items = batchItems.split('\n').filter(line => line.trim()).map(line => {
        const parts = line.split(',').map(part => part.trim());
        return {
          description: parts[0] || '',
          quantity: parts[1] ? parseFloat(parts[1]) : undefined,
          unitPrice: parts[2] ? parseFloat(parts[2]) : undefined,
          unit: parts[3] || undefined
        };
      }).filter(item => item.description);

      if (items.length === 0) {
        toast({
          title: "Error",
          description: "No valid items found in batch input",
          variant: "destructive",
        });
        return;
      }

      classifyBatchMutation.mutate(items);
    } catch (error) {
      toast({
        title: "Error",
        description: "Invalid batch format",
        variant: "destructive",
      });
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      materials_supplies: 'bg-blue-100 text-blue-800',
      equipment_tools: 'bg-green-100 text-green-800',
      services_labor: 'bg-purple-100 text-purple-800',
      utilities_facilities: 'bg-orange-100 text-orange-800',
      food_beverages: 'bg-pink-100 text-pink-800',
      transportation_logistics: 'bg-indigo-100 text-indigo-800',
      technology_software: 'bg-cyan-100 text-cyan-800',
      marketing_advertising: 'bg-yellow-100 text-yellow-800',
      other: 'bg-gray-100 text-gray-800'
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <FileText className="h-8 w-8" />
            Line Item Classification
          </h1>
          <p className="text-muted-foreground">
            AI-powered classification of invoice line items with confidence scoring and batch processing
          </p>
        </div>

        {/* Available Categories */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Available Categories</CardTitle>
            <CardDescription>
              These are the classification categories supported by the AI classifier
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {categories && Object.entries(categories).map(([key, description]) => (
                <Badge key={key} variant="secondary" className={getCategoryColor(key)}>
                  {key.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Single Item Classification */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Single Item Classification
              </CardTitle>
              <CardDescription>
                Classify individual line items with detailed analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="e.g., Cemento portland tipo I, 50kg"
                  value={lineItem.description}
                  onChange={(e) => setLineItem({...lineItem, description: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    placeholder="50"
                    value={lineItem.quantity || ''}
                    onChange={(e) => setLineItem({...lineItem, quantity: parseFloat(e.target.value) || undefined})}
                  />
                </div>
                <div>
                  <Label htmlFor="unit">Unit</Label>
                  <Input
                    id="unit"
                    placeholder="kg, m², pcs"
                    value={lineItem.unit || ''}
                    onChange={(e) => setLineItem({...lineItem, unit: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="unitPrice">Unit Price</Label>
                  <Input
                    id="unitPrice"
                    type="number"
                    placeholder="25000"
                    value={lineItem.unitPrice || ''}
                    onChange={(e) => setLineItem({...lineItem, unitPrice: parseFloat(e.target.value) || undefined})}
                  />
                </div>
                <div>
                  <Label htmlFor="totalPrice">Total Price</Label>
                  <Input
                    id="totalPrice"
                    type="number"
                    placeholder="1250000"
                    value={lineItem.totalPrice || ''}
                    onChange={(e) => setLineItem({...lineItem, totalPrice: parseFloat(e.target.value) || undefined})}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="rawText">Raw Text (Optional)</Label>
                <Textarea
                  id="rawText"
                  placeholder="Original text from invoice if different from description"
                  value={lineItem.rawText || ''}
                  onChange={(e) => setLineItem({...lineItem, rawText: e.target.value})}
                />
              </div>

              <Button 
                onClick={handleSingleClassification}
                disabled={classifySingleMutation.isPending}
                className="w-full"
              >
                {classifySingleMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Classifying...</>
                ) : (
                  <>Classify Item</>
                )}
              </Button>

              {/* Single Item Result */}
              {classificationResult && (
                <div className="mt-4 p-4 border rounded-lg">
                  <h4 className="font-semibold mb-2">Classification Result</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge className={getCategoryColor(classificationResult.category)}>
                        {classificationResult.category.replace(/_/g, ' ')}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {Math.round(classificationResult.confidence * 100)}% confidence
                      </span>
                    </div>
                    <p className="text-sm">Method: {classificationResult.method}</p>
                    {classificationResult.matchedKeywords.length > 0 && (
                      <div>
                        <p className="text-sm font-medium">Matched Keywords:</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {classificationResult.matchedKeywords.map((keyword, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {keyword}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {classificationResult.reasoning && (
                      <div>
                        <p className="text-sm font-medium">AI Reasoning:</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {classificationResult.reasoning}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Batch Classification */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Batch Classification
              </CardTitle>
              <CardDescription>
                Process multiple items at once (CSV format: description, quantity, unitPrice, unit)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="batchItems">Batch Items</Label>
                <Textarea
                  id="batchItems"
                  placeholder={`Cemento portland tipo I, 50, 25000, kg
Servicios de consultoría, 1, 150000
Laptop Dell Inspiron, 1, 2500000, pcs`}
                  value={batchItems}
                  onChange={(e) => setBatchItems(e.target.value)}
                  rows={8}
                />
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={handleBatchClassification}
                  disabled={classifyBatchMutation.isPending}
                  className="flex-1"
                >
                  {classifyBatchMutation.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                  ) : (
                    <>Classify Batch</>
                  )}
                </Button>

                <Button 
                  variant="outline"
                  onClick={() => testClassificationMutation.mutate()}
                  disabled={testClassificationMutation.isPending}
                >
                  {testClassificationMutation.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /></>
                  ) : (
                    <><TestTube className="mr-2 h-4 w-4" /> Test</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Batch Results */}
        {batchResults && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Batch Results</CardTitle>
              <CardDescription>
                Classification results for {batchResults.length} items
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {batchResults.map((result, index) => (
                  <div key={index} className="p-3 border rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h5 className="font-medium">{result.item.description}</h5>
                        {result.item.quantity && (
                          <p className="text-sm text-muted-foreground">
                            Qty: {result.item.quantity} {result.item.unit}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getCategoryColor(result.classification.category)}>
                          {result.classification.category.replace(/_/g, ' ')}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(result.classification.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                    {result.classification.matchedKeywords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {result.classification.matchedKeywords.map((keyword: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {keyword}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}