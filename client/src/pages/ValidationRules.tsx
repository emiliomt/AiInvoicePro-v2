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
import { Plus, Edit, Trash2, Shield, AlertTriangle, Info, XCircle, AlertCircle } from "lucide-react";
import Header from "@/components/Header";
import { ValidationRulesErrorBoundary } from "@/components/ErrorBoundary";

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

const FIELD_OPTIONS = [
  { value: "vendorName", label: "Vendor Name" },
  { value: "invoiceNumber", label: "Invoice Number" },
  { value: "totalAmount", label: "Total Amount" },
  { value: "taxAmount", label: "Tax Amount" },
  { value: "subtotal", label: "Subtotal" },
  { value: "invoiceDate", label: "Invoice Date" },
  { value: "dueDate", label: "Due Date" },
  { value: "currency", label: "Currency" },
  { value: "confidenceScore", label: "Confidence Score" },
  { value: "projectName", label: "Project Name" },
  { value: "fileName", label: "File Name" },
  { value: "status", label: "Invoice Status" },
  { value: "extractedData.taxId", label: "Vendor Tax ID (NIT)" },
  { value: "extractedData.buyerTaxId", label: "Buyer Tax ID" },
  { value: "extractedData.companyName", label: "Company Name (Buyer)" },
  { value: "extractedData.vendorAddress", label: "Vendor Address" },
  { value: "extractedData.buyerAddress", label: "Buyer Address" },
  { value: "extractedData.projectAddress", label: "Project Address" },
  { value: "extractedData.projectCity", label: "Project City" },
  { value: "extractedData.concept", label: "Concept/Description" },
  { value: "extractedData.descriptionSummary", label: "Description Summary" },
  { value: "extractedData.notes", label: "Notes" },
  { value: "extractedData.projectName", label: "Extracted Project Name" },
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

function ValidationRulesContent() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ValidationRule | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    fieldName: "",
    ruleType: "",
    ruleValue: "",
    severity: "medium" as "low" | "medium" | "high" | "critical",
    errorMessage: "",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get validation rules with improved error handling
  const { data: rules, isLoading, error, refetch } = useQuery<ValidationRule[]>({
    queryKey: ["/api/validation-rules"],
    queryFn: async () => {
      console.log("🔄 Frontend: Fetching validation rules...");

      try {
        const response = await fetch('/api/validation-rules', {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });

        console.log("📡 Frontend: Response status:", response.status);
        console.log("📡 Frontend: Response headers:", Object.fromEntries(response.headers.entries()));

        // Check content-type to ensure it's JSON
        const contentType = response.headers.get('content-type');
        console.log("📡 Frontend: Content-Type:", contentType);

        if (!contentType || !contentType.includes('application/json')) {
          const responseText = await response.text();
          console.error("❌ Frontend: Non-JSON Response received:", responseText.substring(0, 500));
          throw new Error(`Server returned non-JSON response (${contentType}). Response: ${responseText.substring(0, 200)}...`);
        }

        if (!response.ok) {
          const errorData = await response.json();
          console.error("❌ Frontend: API Error Response:", errorData);
          throw new Error(`API Error ${response.status}: ${errorData.message || errorData.error || 'Unknown error'}`);
        }

        console.log("✅ Frontend: Response OK, parsing JSON...");
        const data = await response.json();
        console.log("✅ Frontend: Parsed validation rules:", data);

        // Ensure we have an array
        if (!Array.isArray(data)) {
          console.error("❌ Frontend: Response is not an array:", data);
          return [];
        }

        return data;
      } catch (error) {
        console.error("❌ Frontend: Fetch validation rules error:", error);
        throw error;
      }
    },
    retry: 1,
    retryDelay: 1000,
  });

  // Create/Update rule mutation
  const saveRuleMutation = useMutation({
    mutationFn: async (ruleData: any) => {
      console.log("🚀 Frontend: Starting mutation with data:", JSON.stringify(ruleData, null, 2));

      try {
        // Validate data before sending
        if (!ruleData.name?.trim()) {
          throw new Error("Rule name is required");
        }
        if (!ruleData.fieldName?.trim()) {
          throw new Error("Field name is required");
        }
        if (!ruleData.ruleType?.trim()) {
          throw new Error("Rule type is required");
        }
        if (!ruleData.ruleValue?.trim()) {
          throw new Error("Rule value is required");
        }

        let response;
        let result;

        if (editingRule) {
          console.log("🔄 Frontend: Making PUT request to update rule", editingRule.id);
          response = await apiRequest('PUT', `/api/validation-rules/${editingRule.id}`, ruleData);
        } else {
          console.log("🔄 Frontend: Making POST request to create new rule");
          response = await apiRequest('POST', '/api/validation-rules', ruleData);
        }

        console.log("📊 Frontend: Response status:", response.status);
        console.log("📊 Frontend: Response headers:", Object.fromEntries(response.headers.entries()));

        // Enhanced error handling for non-ok responses
        if (!response.ok) {
          let errorMessage = `Server error (${response.status})`;
          let errorDetails: any = {};

          try {
            const contentType = response.headers.get('content-type');
            console.log("📊 Frontend: Content-Type:", contentType);

            if (contentType && contentType.includes('application/json')) {
              const errorData = await response.json();
              console.log("❌ Frontend: Server error data:", JSON.stringify(errorData, null, 2));

              errorMessage = errorData.message || errorData.error || errorMessage;
              errorDetails = {
                status: response.status,
                statusText: response.statusText,
                serverData: errorData,
                url: response.url
              };

              // Extract specific error messages
              if (errorData.details) {
                errorMessage += ` - ${errorData.details}`;
              }
              if (errorData.code) {
                errorMessage += ` (Code: ${errorData.code})`;
              }
              if (errorData.constraint) {
                errorMessage += ` - Database constraint: ${errorData.constraint}`;
              }
            } else {
              const errorText = await response.text();
              console.log("❌ Frontend: Server error text:", errorText);

              errorMessage = errorText || errorMessage;
              errorDetails = {
                status: response.status,
                statusText: response.statusText,
                responseText: errorText,
                url: response.url
              };
            }
          } catch (parseError) {
            console.error("❌ Frontend: Could not parse error response:", parseError);
            errorDetails = {
              status: response.status,
              statusText: response.statusText,
              parseError: parseError instanceof Error ? parseError.message : String(parseError),
              url: response.url
            };
          }

          console.error("❌ Frontend: Full error details:", errorDetails);

          // Create enhanced error with details
          const enhancedError = new Error(errorMessage);
          (enhancedError as any).details = errorDetails;
          throw enhancedError;
        }

        // Enhanced success response parsing
        try {
          const contentType = response.headers.get('content-type');
          console.log("✅ Frontend: Success Content-Type:", contentType);

          if (contentType && contentType.includes('application/json')) {
            result = await response.json();
            console.log("✅ Frontend: Response received:", JSON.stringify(result, null, 2));
            return result;
          } else {
            // Handle non-JSON success responses
            const responseText = await response.text();
            console.log("✅ Frontend: Non-JSON response:", responseText);

            // Return a synthetic success object
            return {
              success: true,
              message: "Rule saved successfully",
              responseText: responseText
            };
          }
        } catch (parseError) {
          console.error("❌ Frontend: Failed to parse success response:", parseError);
          console.error("❌ Frontend: Parse error details:", {
            error: parseError instanceof Error ? parseError.message : String(parseError),
            responseStatus: response.status,
            responseUrl: response.url
          });

          // Still consider it a success if the HTTP status was ok
          return {
            success: true,
            message: "Rule saved successfully (response parse failed)",
            parseError: parseError instanceof Error ? parseError.message : String(parseError)
          };
        }

      } catch (error) {
        console.error("❌ Frontend: Mutation failed with error:", error);

        // Enhanced error logging
        if (error instanceof Error) {
          console.error("❌ Frontend: Error name:", error.name);
          console.error("❌ Frontend: Error message:", error.message);
          console.error("❌ Frontend: Error stack:", error.stack);

          // Log additional details if available
          if ((error as any).details) {
            console.error("❌ Frontend: Error details:", (error as any).details);
          }

          throw error;
        } else {
          console.error("❌ Frontend: Non-Error object thrown:", error);
          throw new Error(`An unexpected error occurred: ${JSON.stringify(error)}`);
        }
      }
    },
    onSuccess: (data) => {
      console.log("🎉 Frontend: Mutation successful with data:", JSON.stringify(data, null, 2));
      toast({
        title: editingRule ? "Rule Updated" : "Rule Created",
        description: `Validation rule has been ${editingRule ? "updated" : "created"} successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/validation-rules"] });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      console.error("❌ Frontend: Mutation failed:");
      console.error("    Error message:", error.message);
      console.error("    Error stack:", error.stack);
      console.error("    Full error object:", error);

      // Log additional error details if available
      if ((error as any).details) {
        console.error("    Error details:", (error as any).details);
      }

      if (isUnauthorizedError(error)) {
        console.log("🔐 Frontend: Unauthorized error detected, redirecting to login");
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

      // Enhanced error message construction
      let errorTitle = "Save Failed";
      let errorDescription = error.message || "An unknown error occurred";

      // Check for specific error types and provide better messages
      if (error.message.includes("Network error")) {
        errorTitle = "Network Error";
        errorDescription = "Unable to connect to the server. Please check your internet connection and try again.";
      } else if (error.message.includes("Server error (5")) {
        errorTitle = "Server Error";
        errorDescription = "The server encountered an error. Please try again in a few moments.";
      } else if (error.message.includes("constraint")) {
        errorTitle = "Validation Error";
        errorDescription = "A validation rule with similar settings already exists. Please check your field name and rule type.";
      } else if (error.message.includes("Database")) {
        errorTitle = "Database Error";
        errorDescription = "There was an issue saving to the database. Please try again or contact support if the problem persists.";
      }

      // Add technical details for developers in development mode
      if (process.env.NODE_ENV === 'development' && (error as any).details) {
        const details = (error as any).details;
        if (details.status) {
          errorDescription += ` (HTTP ${details.status})`;
        }
        if (details.serverData?.code) {
          errorDescription += ` [${details.serverData.code}]`;
        }
      }

      console.log("🔔 Frontend: Showing toast with:", { errorTitle, errorDescription });

      toast({
        title: errorTitle,
        description: errorDescription,
        variant: "destructive",
      });
    },
  });

  // Delete rule mutation
  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId: number) => {
      try {
        if (!ruleId || isNaN(ruleId)) {
          throw new Error("Invalid rule ID");
        }

        const response = await apiRequest('DELETE', `/api/validation-rules/${ruleId}`);

        if (!response.ok) {
          let errorMessage = `Failed to delete rule (${response.status})`;

          try {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const errorData = await response.json();
              errorMessage = errorData.message || errorData.error || errorMessage;
            } else {
              const errorText = await response.text();
              errorMessage = errorText || errorMessage;
            }
          } catch (parseError) {
            console.warn("Could not parse delete error response:", parseError);
          }

          throw new Error(errorMessage);
        }

        return response;
      } catch (error) {
        console.error("Delete rule error:", error);
        throw error instanceof Error ? error : new Error("Failed to delete validation rule");
      }
    },
    onSuccess: () => {
      toast({
        title: "Rule Deleted",
        description: "Validation rule has been deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/validation-rules"] });
    },
    onError: (error: Error) => {
      console.error("Delete mutation error:", error);

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
        description: error.message || "An unexpected error occurred while deleting the rule",
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
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      description: rule.description || "",
      fieldName: rule.fieldName,
      ruleType: rule.ruleType,
      ruleValue: rule.ruleValue || rule.ruleData || "",
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

    try {
      console.log("📝 Frontend: Form submission started");
      console.log("📝 Frontend: Current form data:", JSON.stringify(formData, null, 2));

      // Comprehensive form validation
      const errors: string[] = [];

      if (!formData.name?.trim()) {
        errors.push("Rule name is required");
      }
      if (!formData.fieldName?.trim()) {
        errors.push("Field name is required");
      }
      if (!formData.ruleType?.trim()) {
        errors.push("Rule type is required");
      }
      if (!formData.ruleValue?.trim()) {
        errors.push("Rule value is required");
      }

      // Rule-specific validation
      if (formData.ruleType === "range" && formData.ruleValue) {
        const rangeParts = formData.ruleValue.split(',');
        if (rangeParts.length !== 2 || isNaN(Number(rangeParts[0])) || isNaN(Number(rangeParts[1]))) {
          errors.push("Range rule value must be in format 'min,max' (e.g., '0,1000')");
        }
      }

      if (formData.ruleType === "regex" && formData.ruleValue) {
        try {
          new RegExp(formData.ruleValue);
        } catch (regexError) {
          errors.push("Invalid regex pattern");
        }
      }

      if (errors.length > 0) {
        console.error("❌ Frontend: Form validation failed:", errors);
        toast({
          title: "Validation Error",
          description: errors.join('. '),
          variant: "destructive",
        });
        return;
      }

      console.log("✅ Frontend: Form validation passed, submitting data");

      // Clean the form data before sending
      const cleanFormData = {
        name: formData.name.trim(),
        description: formData.description?.trim() || null,
        fieldName: formData.fieldName.trim(),
        ruleType: formData.ruleType.trim(),
        ruleValue: formData.ruleValue.trim(),
        severity: formData.severity,
        errorMessage: formData.errorMessage?.trim() || null,
      };

      saveRuleMutation.mutate(cleanFormData);
    } catch (error) {
      console.error("❌ Frontend: Form submission error:", error);
      toast({
        title: "Submission Error",
        description: "An unexpected error occurred while preparing the form data",
        variant: "destructive",
      });
    }
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
        return ruleValue || "No rule value specified";
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading validation rules...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Error Loading Validation Rules
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p className="mb-2">{error instanceof Error ? error.message : "An unknown error occurred"}</p>
                <button
                  onClick={() => refetch()}
                  className="text-red-600 hover:text-red-500 underline"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
                        {FIELD_OPTIONS.map((field) => (
                          <SelectItem key={field.value} value={field.value}>
                            {field.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formData.fieldName && (
                      <p className="text-xs text-gray-500 mt-1">
                        Field path: <code className="bg-gray-100 px-1 rounded">{formData.fieldName}</code>
                        {formData.fieldName.startsWith('extractedData.') && 
                          <span className="ml-2 text-amber-600">⚠️ Nested field in extracted data</span>
                        }
                      </p>
                    )}
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
          {queryError ? (
            <Card>
              <CardContent className="p-6">
                <div className="text-center">
                  <div className="text-red-500 text-4xl mb-4">⚠️</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Rules</h3>
                  <p className="text-gray-600 mb-4">
                    {isUnauthorizedError(queryError as Error) 
                      ? "You are not authorized to view this data. Please log in again."
                      : (queryError as Error)?.message || "Failed to load validation rules"
                    }
                  </p>
                  {isUnauthorizedError(queryError as Error) ? (
                    <Button 
                      onClick={() => window.location.href = "/api/login"}
                      className="bg-primary-600 hover:bg-primary-700"
                    >
                      Login Again
                    </Button>
                  ) : (
                    <Button 
                      onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/validation-rules"] })}
                      variant="outline"
                    >
                      Try Again
                    </Button>
                  )}
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
                      </Button>                    </div>
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
                        {getRuleTypeDescription(rule.ruleType, rule.ruleValue || rule.ruleData || '')}
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
    </div>
  );
}

export default function ValidationRules() {
  return (
    <ValidationRulesErrorBoundary>
      <ValidationRulesContent />
    </ValidationRulesErrorBoundary>
  );
}