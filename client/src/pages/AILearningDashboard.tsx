
import React from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Brain, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import Header from "@/components/Header";

interface LearningMetrics {
  accuracy: number;
  improvementRate: number;
  commonErrors: Array<{
    field: string;
    errorType: string;
    frequency: number;
    trend: 'improving' | 'stable' | 'declining';
  }>;
  performanceHistory: Array<{
    date: string;
    accuracy: number;
    totalExtractions: number;
    errorCount: number;
  }>;
}

interface LearningInsights {
  summary: string;
  recommendations: string[];
  keyMetrics: {
    accuracy: number;
    improvementRate: number;
    totalFeedback: number;
  };
}

export default function AILearningDashboard() {
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['/api/ai/learning-metrics'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/ai/learning-metrics');
      return response.json() as Promise<LearningMetrics>;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: insights, isLoading: insightsLoading } = useQuery({
    queryKey: ['/api/ai/learning-insights'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/ai/learning-insights');
      return response.json() as Promise<LearningInsights>;
    },
    refetchInterval: 60000, // Refresh every minute
  });

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'declining':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      default:
        return <Minus className="w-4 h-4 text-gray-400" />;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'improving':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'declining':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (metricsLoading || insightsLoading) {
    return (
      <div className="p-8 space-y-6">
        <div className="flex items-center space-x-3">
          <Brain className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold">AI Learning Dashboard</h1>
            <p className="text-gray-600">Loading learning metrics...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-6 bg-gray-200 rounded w-3/4"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Page Header */}
          <div className="flex items-center space-x-3">
            <Brain className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold">AI Learning Dashboard</h1>
              <p className="text-gray-600">Track AI extraction accuracy and learning progress</p>
            </div>
          </div>

      {/* AI Insights Summary */}
      {insights && (
        <Alert className="border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>AI Learning Summary:</strong> {insights.summary}
          </AlertDescription>
        </Alert>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Current Accuracy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {metrics?.accuracy.toFixed(1)}%
            </div>
            <Progress value={metrics?.accuracy || 0} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Improvement Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold flex items-center space-x-2 ${
              (metrics?.improvementRate || 0) >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              <span>{metrics?.improvementRate >= 0 ? '+' : ''}{metrics?.improvementRate.toFixed(1)}%</span>
              {(metrics?.improvementRate || 0) >= 0 ? 
                <TrendingUp className="w-5 h-5" /> : 
                <TrendingDown className="w-5 h-5" />
              }
            </div>
            <p className="text-sm text-gray-500 mt-1">vs previous period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Feedback
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {insights?.keyMetrics.totalFeedback || 0}
            </div>
            <p className="text-sm text-gray-500 mt-1">learning samples</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Error Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {metrics?.commonErrors.length || 0}
            </div>
            <p className="text-sm text-gray-500 mt-1">identified patterns</p>
          </CardContent>
        </Card>
      </div>

      {/* Performance History Chart */}
      {metrics?.performanceHistory && metrics.performanceHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Accuracy Trend</CardTitle>
            <CardDescription>AI extraction accuracy over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={metrics.performanceHistory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(date) => new Date(date).toLocaleDateString()}
                />
                <YAxis domain={[0, 100]} />
                <Tooltip 
                  labelFormatter={(date) => new Date(date).toLocaleDateString()}
                  formatter={(value: number) => [`${value.toFixed(1)}%`, 'Accuracy']}
                />
                <Line 
                  type="monotone" 
                  dataKey="accuracy" 
                  stroke="#2563eb" 
                  strokeWidth={2}
                  dot={{ fill: '#2563eb', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Common Errors */}
        <Card>
          <CardHeader>
            <CardTitle>Common Error Patterns</CardTitle>
            <CardDescription>Most frequent extraction errors and their trends</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {metrics?.commonErrors.length ? (
                metrics.commonErrors.slice(0, 8).map((error, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium text-sm capitalize">
                        {error.field.replace(/([A-Z])/g, ' $1')}
                      </div>
                      <div className="text-xs text-gray-500">{error.errorType.replace(/_/g, ' ')}</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline" className="text-xs">
                        {error.frequency} errors
                      </Badge>
                      <Badge className={`text-xs ${getTrendColor(error.trend)}`}>
                        <div className="flex items-center space-x-1">
                          {getTrendIcon(error.trend)}
                          <span className="capitalize">{error.trend}</span>
                        </div>
                      </Badge>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                  <p>No common error patterns detected</p>
                  <p className="text-sm">AI is performing well!</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recommendations */}
        <Card>
          <CardHeader>
            <CardTitle>Learning Recommendations</CardTitle>
            <CardDescription>Suggested actions to improve AI performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {insights?.recommendations.length ? (
                insights.recommendations.map((recommendation, index) => (
                  <div key={index} className="flex items-start space-x-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-blue-800">{recommendation}</p>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                  <p>No specific recommendations</p>
                  <p className="text-sm">AI is learning effectively!</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Extraction Volume Chart */}
      {metrics?.performanceHistory && metrics.performanceHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Extraction Volume</CardTitle>
            <CardDescription>Daily extraction volume and error counts</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={metrics.performanceHistory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(date) => new Date(date).toLocaleDateString()}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(date) => new Date(date).toLocaleDateString()}
                />
                <Bar dataKey="totalExtractions" fill="#3b82f6" name="Total Extractions" />
                <Bar dataKey="errorCount" fill="#ef4444" name="Errors" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
        </div>
      </main>
    </div>
  );
}
