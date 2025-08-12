import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Plus, Edit, Trash2, Shield, AlertTriangle, Info, XCircle } from "lucide-react";
import Header from "@/components/Header";

interface ValidationRule {
  id: number;
  name: string;
  description: string | null;
  fieldName: string;
  ruleType: "required" | "regex" | "range" | "enum" | "format";
  ruleValue: string;
  severity: "low" | "medium" | "high" | "critical";
  errorMessage: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Interface for Keyword Category (added for the new feature)
interface KeywordCategory {
  id: number;
  category: string;
  subcategory?: string;
  keywords: string[];
  description?: string;
}

const FIELD_OPTIONS = [
  { value: "vendorName", label: "Vendor Name" },
  { value: "invoiceNumber", label: "Invoice Number" },
  { value: "totalAmount", label: "Total Amount" },
  { value: "taxAmount", label: "Tax Amount" },
  { value: "invoiceDate", label: "Invoice Date" },
  { value: "dueDate", label: "Due Date" },
  { value: "taxId", label: "Tax ID" },
  { value: "currency", label: "Currency" },
];

const RULE_TYPE_OPTIONS = [
  { value: "required", label: "Required Field", description: "Field must have a value" },
  { value: "regex", label: "Pattern Match", description: "Field must match a regex pattern" },
  { value: "range", label: "Numeric Range", description: "Number must be within min,max range" },
  { value: "enum", label: "Allowed Values", description: "Field must be one of specified values" },
  { value: "format", label: "Format Check", description: "Field must match a specific format (email, etc.)" },
  { value: "comparison", label: "Comparison", description: "Compare field value using operators (>, <, =, etc.)" },
];

const SEVERITY_OPTIONS = [
  { value: "low", label: "Low", color: "bg-blue-100 text-blue-800" },
  { value: "medium", label: "Medium", color: "bg-yellow-100 text-yellow-800" },
  { value: "high", label: "High", color: "bg-orange-100 text-orange-800" },
  { value: "critical", label: "Critical", color: "bg-red-100 text-red-800" },
];

export default function ValidationRules() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ValidationRule | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    fieldName: '',
    ruleType: '',
    ruleValue: '',
    severity: 'medium',
    errorMessage: ''
  });
  const [isAddingKeywordCategory, setIsAddingKeywordCategory] = useState(false);
  const [newKeywordCategory, setNewKeywordCategory] = useState({
    category: '',
    subcategory: '',
    keywords: '',
    description: ''
  });
  const [keywordSuggestions, setKeywordSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Placeholder for keyword categories state, assuming it will be managed elsewhere or added later
  const [keywordCategories, setKeywordCategories] = useState<KeywordCategory[]>([]);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get validation rules
  const { data: rules, isLoading } = useQuery<ValidationRule[]>({
    queryKey: ["/api/validation-rules"],
  });

  // Create/Update rule mutation
  const saveRuleMutation = useMutation({
    mutationFn: async (ruleData: any) => {
      console.log('Saving rule data:', ruleData);

      if (editingRule) {
        const response = await apiRequest('PUT', `/api/validation-rules/${editingRule.id}`, ruleData);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to update rule');
        }
        return response.json();
      } else {
        const response = await apiRequest('POST', '/api/validation-rules', ruleData);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to create rule');
        }
        return response.json();
      }
    },
    onSuccess: (data) => {
      console.log('Rule saved successfully:', data);
      toast({
        title: editingRule ? "Rule Updated" : "Rule Created",
        description: `Validation rule has been ${editingRule ? "updated" : "created"} successfully.`,
      });

      // Force refresh the rules list
      queryClient.invalidateQueries({ queryKey: ["/api/validation-rules"] });
      queryClient.refetchQueries({ queryKey: ["/api/validation-rules"] });

      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      console.error('Error saving rule:', error);

      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }

      toast({
        title: "Save Failed",
        description: error.message || "An error occurred while saving the rule",
        variant: "destructive",
      });
    },
  });

  // Delete rule mutation
  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId: number) => {
      await apiRequest('DELETE', `/api/validation-rules/${ruleId}`);
    },
    onSuccess: () => {
      toast({
        title: "Rule Deleted",
        description: "Validation rule has been deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/validation-rules"] });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }

      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      fieldName: "",
      ruleType: "",
      ruleValue: "",
      severity: "medium",
      errorMessage: "",
    });
    setEditingRule(null);
  };

  const handleEdit = (rule: ValidationRule) => {
    console.log('Editing rule:', rule);
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      description: rule.description || "",
      fieldName: rule.fieldName,
      ruleType: rule.ruleType,
      ruleValue: rule.ruleValue || "",
      severity: rule.severity,
      errorMessage: rule.errorMessage || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (ruleId: number) => {
    if (confirm("Are you sure you want to delete this validation rule?")) {
      deleteRuleMutation.mutate(ruleId);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    console.log('Form submission with data:', formData);

    if (!formData.name || !formData.fieldName || !formData.ruleType || !formData.ruleValue) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    // Prepare data for API - keep ruleValue as is since that's what the API expects
    const ruleData = {
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      fieldName: formData.fieldName,
      ruleType: formData.ruleType,
      ruleValue: formData.ruleValue.trim(),
      severity: formData.severity,
      errorMessage: formData.errorMessage.trim() || null
    };

    console.log('Submitting rule data:', ruleData);
    saveRuleMutation.mutate(ruleData);
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <XCircle className="w-4 h-4" />;
      case "high":
        return <AlertTriangle className="w-4 h-4" />;
      case "medium":
        return <Shield className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  const getRuleTypeDescription = (ruleType: string, ruleValue: string) => {
    switch (ruleType) {
      case "required":
        return "Field is required";
      case "regex":
        return `Must match pattern: ${ruleValue}`;
      case "range":
        return `Must be between ${ruleValue}`;
      case "enum":
        return `Must be one of: ${ruleValue}`;
      case "format":
        return `Must be valid ${ruleValue}`;
      case "comparison":
        return `Must satisfy: ${ruleValue}`;
      default:
        return ruleValue;
    }
  };

  // Handlers for AI Keyword Suggestions
  const handleAddKeywordCategory = () => {
    if (!newKeywordCategory.category || !newKeywordCategory.keywords) {
      alert('Please fill in category and keywords');
      return;
    }

    const keywordArray = newKeywordCategory.keywords
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    const category: KeywordCategory = {
      id: Date.now(),
      category: newKeywordCategory.category,
      subcategory: newKeywordCategory.subcategory || undefined,
      keywords: keywordArray,
      description: newKeywordCategory.description || undefined,
    };

    setKeywordCategories([...keywordCategories, category]);
    setNewKeywordCategory({
      category: '',
      subcategory: '',
      keywords: '',
      description: ''
    });
    setKeywordSuggestions([]);
    setShowSuggestions(false);
    setIsAddingKeywordCategory(false);
  };

  const getAIKeywordSuggestions = async () => {
    if (!newKeywordCategory.category.trim()) {
      alert('Please enter a category first');
      return;
    }

    setLoadingSuggestions(true);
    try {
      const existingKeywords = newKeywordCategory.keywords
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);

      const response = await fetch('/api/ai/keyword-suggestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: newKeywordCategory.category.toLowerCase().replace(/\s+/g, '_'),
          subcategory: newKeywordCategory.subcategory,
          existing_keywords: existingKeywords
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get suggestions');
      }

      const data = await response.json();
      setKeywordSuggestions(data.suggestions || []);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Error getting keyword suggestions:', error);
      alert('Failed to get AI suggestions. Please try again.');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const addKeywordFromSuggestion = (keyword: string) => {
    const currentKeywords = newKeywordCategory.keywords
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    if (!currentKeywords.includes(keyword)) {
      const newKeywords = currentKeywords.length > 0 
        ? `${newKeywordCategory.keywords.trim()}, ${keyword}`
        : keyword;

      setNewKeywordCategory({
        ...newKeywordCategory,
        keywords: newKeywords
      });

      // Remove the added keyword from suggestions
      setKeywordSuggestions(prev => prev.filter(s => s !== keyword));
    }
  };

  const resetNewKeywordCategory = () => {
    setNewKeywordCategory({
      category: '',
      subcategory: '',
      keywords: '',
      description: ''
    });
    setKeywordSuggestions([]);
    setShowSuggestions(false);
    setLoadingSuggestions(false);
    setIsAddingKeywordCategory(false);
  };


  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Validation Rules</h1>
          <p className="text-gray-600 mt-2">
            Configure validation rules to ensure invoice data quality and compliance.
          </p>
        </div>

        <div className="mb-6">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                onClick={resetForm}
                className="bg-primary-600 hover:bg-primary-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add New Rule
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingRule ? "Edit Validation Rule" : "Create New Validation Rule"}
                </DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Rule Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Tax ID Format Check"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="fieldName">Field Name *</Label>
                    <Select 
                      value={formData.fieldName} 
                      onValueChange={(value) => setFormData({ ...formData, fieldName: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select field" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vendorName">Vendor Name</SelectItem>
                        <SelectItem value="totalAmount">Total Amount</SelectItem>
                        <SelectItem value="taxAmount">Tax Amount</SelectItem>
                        <SelectItem value="subtotal">Subtotal</SelectItem>
                        <SelectItem value="currency">Currency</SelectItem>
                        <SelectItem value="invoiceDate">Invoice Date</SelectItem>
                        <SelectItem value="dueDate">Due Date</SelectItem>
                        <SelectItem value="invoiceNumber">Invoice Number</SelectItem>
                        <SelectItem value="projectName">Project Name</SelectItem>
                        <SelectItem value="confidenceScore">Confidence Score</SelectItem>
                        <SelectItem value="extractedData.taxId">Vendor Tax ID</SelectItem>
                        <SelectItem value="extractedData.companyName">Company Name (Buyer)</SelectItem>
                        <SelectItem value="extractedData.buyerTaxId">Buyer Tax ID</SelectItem>
                        <SelectItem value="extractedData.vendorAddress">Vendor Address</SelectItem>
                        <SelectItem value="extractedData.buyerAddress">Buyer Address</SelectItem>
                        <SelectItem value="extractedData.projectAddress">Project Address</SelectItem>
                        <SelectItem value="extractedData.projectCity">Project City</SelectItem>
                        <SelectItem value="extractedData.concept">Concept/Description</SelectItem>
                        <SelectItem value="extractedData.descriptionSummary">Description Summary</SelectItem>
                        <SelectItem value="extractedData.notes">Notes</SelectItem>
                        <SelectItem value="extractedData.projectName">Extracted Project Name</SelectItem>
                        <SelectItem value="status">Invoice Status</SelectItem>
                        <SelectItem value="fileName">File Name</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="ruleType">Rule Type *</Label>
                    <Select 
                      value={formData.ruleType} 
                      onValueChange={(value) => setFormData({ ...formData, ruleType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select rule type" />
                      </SelectTrigger>
                      <SelectContent>
                        {RULE_TYPE_OPTIONS.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            <div>
                              <div className="font-medium">{type.label}</div>
                              <div className="text-xs text-gray-500">{type.description}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="severity">Severity</Label>
                    <Select 
                      value={formData.severity} 
                      onValueChange={(value: any) => setFormData({ ...formData, severity: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SEVERITY_OPTIONS.map((severity) => (
                          <SelectItem key={severity.value} value={severity.value}>
                            {severity.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="ruleValue">Rule Value *</Label>
                  <Input
                    id="ruleValue"
                    value={formData.ruleValue}
                    onChange={(e) => setFormData({ ...formData, ruleValue: e.target.value })}
                    placeholder={
                      formData.ruleType === "regex" ? "^[A-Z]{3}\\d{6}[A-Z0-9]{3}$" :
                      formData.ruleType === "range" ? "0,1000000" :
                      formData.ruleType === "enum" ? "USD,EUR,GBP" :
                      formData.ruleType === "format" ? "email" :
                      formData.ruleType === "comparison" ? ">1000 or <=5000 or =100" :
                      "Rule value"
                    }
                    required
                  />
                  {formData.ruleType && (
                    <p className="text-xs text-gray-500 mt-1">
                      {formData.ruleType === "regex" && "Enter a regular expression pattern"}
                      {formData.ruleType === "range" && "Enter min,max values (e.g., 0,1000000)"}
                      {formData.ruleType === "enum" && "Enter comma-separated allowed values"}
                      {formData.ruleType === "format" && "Enter format type (email, etc.)"}
                      {formData.ruleType === "required" && "Enter 'true' to make field required"}
                      {formData.ruleType === "comparison" && "Enter comparison operator and value (e.g., >1000, <=5000, =100, !=0)"}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe what this rule validates..."
                    rows={2}
                  />
                </div>

                <div>
                  <Label htmlFor="errorMessage">Custom Error Message</Label>
                  <Input
                    id="errorMessage"
                    value={formData.errorMessage}
                    onChange={(e) => setFormData({ ...formData, errorMessage: e.target.value })}
                    placeholder="Custom message to show when validation fails"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={saveRuleMutation.isPending}
                    className="bg-primary-600 hover:bg-primary-700"
                  >
                    {saveRuleMutation.isPending 
                      ? "Saving..." 
                      : editingRule 
                        ? "Update Rule" 
                        : "Create Rule"
                    }
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Rules List */}
        <div className="grid grid-cols-1 gap-6">
          {isLoading ? (
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                  <span className="ml-2 text-gray-600">Loading validation rules...</span>
                </div>
              </CardContent>
            </Card>
          ) : rules && rules.length > 0 ? (
            rules.map((rule) => (
              <Card key={rule.id} className="bg-white shadow-sm border border-gray-200">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg ${
                        SEVERITY_OPTIONS.find(s => s.value === rule.severity)?.color || "bg-gray-100"
                      }`}>
                        {getSeverityIcon(rule.severity)}
                      </div>
                      <div>
                        <CardTitle className="text-lg">{rule.name}</CardTitle>
                        {rule.description && (
                          <p className="text-sm text-gray-600 mt-1">{rule.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge 
                        variant="secondary"
                        className={SEVERITY_OPTIONS.find(s => s.value === rule.severity)?.color}
                      >
                        {rule.severity.toUpperCase()}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(rule)}
                        className="text-primary-600 hover:text-primary-700"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(rule.id)}
                        className="text-red-600 hover:text-red-700"
                        disabled={deleteRuleMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-700">Field:</span>
                      <p className="text-gray-900">
                        {FIELD_OPTIONS.find(f => f.value === rule.fieldName)?.label || rule.fieldName}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Rule Type:</span>
                      <p className="text-gray-900">
                        {RULE_TYPE_OPTIONS.find(t => t.value === rule.ruleType)?.label || rule.ruleType}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Validation:</span>
                      <p className="text-gray-900">
                        {getRuleTypeDescription(rule.ruleType, rule.ruleValue || '')}
                      </p>
                    </div>
                  </div>
                  {rule.errorMessage && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                      <span className="font-medium text-gray-700">Error Message:</span>
                      <p className="text-gray-900 text-sm mt-1">{rule.errorMessage}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Validation Rules</h3>
                <p className="text-gray-600 mb-6">
                  Create your first validation rule to ensure invoice data quality.
                </p>
                <Button 
                  onClick={() => setIsDialogOpen(true)}
                  className="bg-primary-600 hover:bg-primary-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Rule
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Keyword Category Modal (Placeholder for new functionality) */}
      <Dialog open={isAddingKeywordCategory} onOpenChange={setIsAddingKeywordCategory}>
        <DialogTrigger asChild>
          <Button 
            onClick={() => {
              setIsAddingKeywordCategory(true);
              resetNewKeywordCategory();
            }}
            className="bg-green-600 hover:bg-green-700 ml-4" // Example button to open keyword modal
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Keyword Category
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Keyword Category</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleAddKeywordCategory(); }} className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="category">Category *</Label>
                <Input
                  id="category"
                  value={newKeywordCategory.category}
                  onChange={(e) => setNewKeywordCategory({
                    ...newKeywordCategory,
                    category: e.target.value
                  })}
                  placeholder="e.g., materials_supplies"
                />
              </div>

              <div>
                <Label htmlFor="subcategory">Subcategory</Label>
                <Input
                  id="subcategory"
                  value={newKeywordCategory.subcategory}
                  onChange={(e) => setNewKeywordCategory({
                    ...newKeywordCategory,
                    subcategory: e.target.value
                  })}
                  placeholder="e.g., construction"
                />
              </div>

              <div>
                <Label htmlFor="keywords">Keywords *</Label>
                <textarea
                  id="keywords"
                  className="w-full p-2 border rounded-md min-h-[100px]"
                  value={newKeywordCategory.keywords}
                  onChange={(e) => setNewKeywordCategory({
                    ...newKeywordCategory,
                    keywords: e.target.value
                  })}
                  placeholder="Enter keywords separated by commas"
                />

                <div className="mt-2">
                  <Button 
                    type="button"
                    variant="outline" 
                    onClick={getAIKeywordSuggestions}
                    disabled={loadingSuggestions || !newKeywordCategory.category.trim()}
                    className="w-full sm:w-auto"
                  >
                    {loadingSuggestions ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900 mr-2"></div>
                        Generating...
                      </>
                    ) : (
                      <>🤖 Get AI Suggestions</>
                    )}
                  </Button>
                </div>

                {showSuggestions && keywordSuggestions.length > 0 && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-md">
                    <Label className="text-sm font-medium text-gray-700 mb-2 block">
                      Suggested Keywords (click to add):
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {keywordSuggestions.map((keyword, index) => (
                        <Badge
                          key={`${keyword}-${index}`}
                          variant="secondary"
                          className="cursor-pointer hover:bg-blue-100 hover:text-blue-800 transition-colors"
                          onClick={() => addKeywordFromSuggestion(keyword)}
                        >
                          + {keyword}
                        </Badge>
                      ))}
                    </div>
                    {keywordSuggestions.length === 0 && (
                      <p className="text-sm text-gray-500 mt-2">All suggestions have been added!</p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  className="w-full p-2 border rounded-md"
                  value={newKeywordCategory.description}
                  onChange={(e) => setNewKeywordCategory({
                    ...newKeywordCategory,
                    description: e.target.value
                  })}
                  placeholder="Optional description"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={resetNewKeywordCategory}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="bg-green-600 hover:bg-green-700"
              >
                Add Category
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}