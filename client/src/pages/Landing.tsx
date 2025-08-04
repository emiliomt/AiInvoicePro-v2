import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Zap, Shield, TrendingUp } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-white">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <FileText className="text-white" size={20} />
              </div>
              <h1 className="text-xl font-bold text-gray-900">InvoicePro</h1>
            </div>
            <Button 
              onClick={() => window.location.href = '/api/login'}
              className="bg-primary-600 hover:bg-primary-700"
            >
              Sign In
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 sm:text-5xl md:text-6xl">
            AI-Powered Invoice
            <span className="text-primary-600"> Procurement</span>
          </h1>
          <p className="mt-6 text-xl text-gray-600 max-w-3xl mx-auto">
            Transform your invoice processing with intelligent OCR, automated data extraction, 
            and streamlined approval workflows. Save time, reduce errors, and focus on what matters.
          </p>
          <div className="mt-10">
            <Button 
              size="lg"
              onClick={() => window.location.href = '/api/login'}
              className="bg-primary-600 hover:bg-primary-700 text-lg px-8 py-4"
            >
              Get Started Free
            </Button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <Card className="bg-white shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center mb-4">
                <Zap className="text-primary-600" size={24} />
              </div>
              <CardTitle>Intelligent OCR</CardTitle>
              <CardDescription>
                Advanced OCR technology extracts text from PDFs and images with high accuracy
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• Support for PDF, JPG, PNG formats</li>
                <li>• High accuracy text recognition</li>
                <li>• Handles various invoice layouts</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-success-50 rounded-xl flex items-center justify-center mb-4">
                <TrendingUp className="text-success-600" size={24} />
              </div>
              <CardTitle>AI Data Extraction</CardTitle>
              <CardDescription>
                Powered by GPT-4, automatically extracts and structures invoice data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• Vendor and invoice details</li>
                <li>• Line items and amounts</li>
                <li>• Dates and payment terms</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-warning-50 rounded-xl flex items-center justify-center mb-4">
                <Shield className="text-warning-600" size={24} />
              </div>
              <CardTitle>Approval Workflows</CardTitle>
              <CardDescription>
                Streamlined approval process with validation rules and audit trails
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• Customizable approval rules</li>
                <li>• Real-time status tracking</li>
                <li>• Complete audit history</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* CTA Section */}
        <div className="mt-20 text-center">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Ready to streamline your invoice processing?
            </h2>
            <p className="text-gray-600 mb-6">
              Join thousands of businesses that trust InvoicePro to handle their invoice procurement.
            </p>
            <Button 
              size="lg"
              onClick={() => window.location.href = '/api/login'}
              className="bg-primary-600 hover:bg-primary-700"
            >
              Start Processing Invoices
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
