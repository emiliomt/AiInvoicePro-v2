import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, CheckCircle, Search, Target } from "lucide-react";

export default function ProjectMatchingTest() {
  const [invoiceId, setInvoiceId] = useState("729");
  const [testResult, setTestResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTestMatching = async () => {
    if (!invoiceId) return;
    
    setIsLoading(true);
    setError(null);
    setTestResult(null);

    try {
      const response = await fetch(`/api/test/project-match/${invoiceId}`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setTestResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Enhanced Project Matching Test</h1>
        <p className="text-muted-foreground mt-2">
          Test the improved AI-powered project matching system with real validation criteria projects
        </p>
      </div>

      {/* Test Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Test Controls
          </CardTitle>
          <CardDescription>
            Enter an invoice ID to test the enhanced project matching algorithm
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Invoice ID (e.g., 729)"
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              className="flex-1"
            />
            <Button 
              onClick={handleTestMatching} 
              disabled={isLoading || !invoiceId}
              className="min-w-[120px]"
            >
              {isLoading ? "Testing..." : "Test Match"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Test Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Test Results */}
      {testResult && (
        <div className="space-y-6">
          {/* Invoice Information */}
          <Card>
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">ID</p>
                  <p className="font-medium">{testResult.invoice?.id || "N/A"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">File Name</p>
                  <p className="font-medium">{testResult.invoice?.fileName || "N/A"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Vendor</p>
                  <p className="font-medium">{testResult.invoice?.vendorName || "N/A"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Amount</p>
                  <p className="font-medium">{testResult.invoice?.totalAmount || "N/A"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Enhanced Matching Results */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Enhanced Matching Results
              </CardTitle>
              <CardDescription>
                Results from the improved project matching algorithm
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Badge variant={testResult.enhancedMatching?.totalMatches > 0 ? "default" : "secondary"}>
                  {testResult.enhancedMatching?.totalMatches || 0} matches found
                </Badge>
                <p className="text-sm text-muted-foreground">
                  Out of {testResult.availableProjects?.total || 0} validation criteria projects
                </p>
              </div>

              {testResult.enhancedMatching?.bestMatch ? (
                <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950/20">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <h4 className="font-semibold text-green-800 dark:text-green-200">
                      Best Match ({testResult.enhancedMatching.bestMatch.matchScore}% confidence)
                    </h4>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                    <div>
                      <p className="text-sm text-muted-foreground">Project Name</p>
                      <p className="font-medium">{testResult.enhancedMatching.bestMatch.project?.name || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Address</p>
                      <p className="font-medium">{testResult.enhancedMatching.bestMatch.project?.address || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">City</p>
                      <p className="font-medium">{testResult.enhancedMatching.bestMatch.project?.city || "N/A"}</p>
                    </div>
                  </div>

                  {testResult.enhancedMatching.bestMatch.matchDetails?.reasons && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Match Reasons:</p>
                      <div className="flex flex-wrap gap-2">
                        {testResult.enhancedMatching.bestMatch.matchDetails.reasons.map((reason: string, index: number) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {reason}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="border rounded-lg p-4 bg-yellow-50 dark:bg-yellow-950/20">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                    <p className="text-yellow-800 dark:text-yellow-200">
                      No suitable project matches found above the minimum threshold
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Available Projects Sample */}
          {testResult.availableProjects?.sample && (
            <Card>
              <CardHeader>
                <CardTitle>Available Validation Criteria Projects</CardTitle>
                <CardDescription>
                  Sample of {testResult.availableProjects.total} projects available for matching
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {testResult.availableProjects.sample.map((project: any) => (
                    <div key={project.projectId} className="flex items-center justify-between p-2 border rounded">
                      <div>
                        <p className="font-medium">{project.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {project.city} • {project.address}
                        </p>
                      </div>
                      <Badge variant="outline">ID: {project.projectId}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}