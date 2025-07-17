
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { 
  User, 
  Shield, 
  CheckCircle, 
  Bot, 
  HelpCircle, 
  Mail, 
  Phone, 
  Building, 
  Globe, 
  Clock,
  Key,
  FileText,
  ExternalLink,
  Database,
  Settings as SettingsIcon,
  Zap,
  RefreshCw
} from "lucide-react";
import Header from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";

interface UserSettings {
  fullName?: string;
  department?: string;
  phoneNumber?: string;
  emailNotifications?: boolean;
  dashboardLayout?: string;
  defaultCurrency?: string;
  timezone?: string;
  aiProcessingMode?: string;
  aiCacheEnabled?: boolean;
  aiCacheExpiry?: string;
  aiAutoInvalidation?: string;
}


              {/* Cache Management Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Cache Management</CardTitle>
                  <CardDescription>
                    Clear cached invoice files and AI extraction results
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">Invoice Files Cache</h4>
                      <p className="text-sm text-gray-600">
                        Clear uploaded invoice files and cached extraction results
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          const response = await apiRequest('DELETE', '/api/invoices/clear-cache');
                          if (response.ok) {
                            toast({
                              title: "Cache Cleared",
                              description: "Invoice files cache has been cleared successfully",
                            });
                          } else {
                            throw new Error('Failed to clear cache');
                          }
                        } catch (error: any) {
                          toast({
                            title: "Error",
                            description: error.message || "Failed to clear cache",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      Clear Cache
                    </Button>
                  </div>
                </CardContent>
              </Card>


export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("profile");
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  // Fetch user settings
  const { data: userSettings = {}, isLoading } = useQuery<UserSettings>({
    queryKey: ['userSettings'],
    queryFn: async () => {
      const response = await fetch('/api/settings/user_preferences');
      if (!response.ok) {
        // Return default settings if none exist
        return {
          fullName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
          department: '',
          phoneNumber: '',
          emailNotifications: true,
          dashboardLayout: 'grid',
          defaultCurrency: 'USD',
          timezone: 'America/New_York',
          aiProcessingMode: 'automatic',
          aiCacheEnabled: true,
          aiCacheExpiry: '24h',
          aiAutoInvalidation: 'on_update'
        };
      }
      const data = await response.json();
      return JSON.parse(data.value || '{}');
    },
  });

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (settings: UserSettings) => {
      const payload = { value: settings };
      console.log('Sending settings payload:', payload);
      
      const response = await fetch('/api/settings/user_preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('Settings update error:', errorData);
        throw new Error(`Failed to update settings: ${response.status}`);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Settings updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['userSettings'] });
    },
    onError: (error: Error) => {
      console.error('Settings update failed:', error);
      toast({ 
        title: "Failed to update settings", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  // Password change mutation
  const changePasswordMutation = useMutation({
    mutationFn: async (passwordData: typeof passwordForm) => {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(passwordData),
      });
      if (!response.ok) throw new Error('Failed to change password');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Password changed successfully" });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    },
    onError: () => {
      toast({ title: "Failed to change password", variant: "destructive" });
    },
  });

  const updateSetting = (key: keyof UserSettings, value: any) => {
    try {
      const currentSettings = userSettings || {};
      const updatedSettings = { ...currentSettings, [key]: value };
      console.log('Updating settings from:', currentSettings, 'to:', updatedSettings);
      updateSettingsMutation.mutate(updatedSettings);
    } catch (error) {
      console.error('Error updating setting:', error);
      toast({ 
        title: "Error updating setting", 
        description: "Please try again",
        variant: "destructive" 
      });
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }

    const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(passwordForm.newPassword)) {
      toast({ 
        title: "Password does not meet requirements", 
        description: "Must be at least 8 characters with letters, numbers, and symbols",
        variant: "destructive" 
      });
      return;
    }

    changePasswordMutation.mutate(passwordForm);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-6xl mx-auto py-8 px-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-96 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-2">Manage your account preferences and system configuration</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="profile" className="flex items-center space-x-2">
              <User size={16} />
              <span>Profile</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center space-x-2">
              <Shield size={16} />
              <span>Security</span>
            </TabsTrigger>
            <TabsTrigger value="validation" className="flex items-center space-x-2">
              <CheckCircle size={16} />
              <span>Validation</span>
            </TabsTrigger>
            <TabsTrigger value="ai" className="flex items-center space-x-2">
              <Bot size={16} />
              <span>AI</span>
            </TabsTrigger>
            <TabsTrigger value="help" className="flex items-center space-x-2">
              <HelpCircle size={16} />
              <span>Help</span>
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            {/* Profile Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <User className="mr-2 h-5 w-5" />
                  Profile Information
                </CardTitle>
                <CardDescription>
                  Update your personal information and account details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input
                      id="fullName"
                      value={userSettings.fullName || ''}
                      onChange={(e) => updateSetting('fullName', e.target.value)}
                      placeholder="Enter your full name"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="department">Department</Label>
                    <Input
                      id="department"
                      value={userSettings.department || ''}
                      onChange={(e) => updateSetting('department', e.target.value)}
                      placeholder="Enter your department"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phoneNumber">Phone Number</Label>
                    <Input
                      id="phoneNumber"
                      value={userSettings.phoneNumber || ''}
                      onChange={(e) => updateSetting('phoneNumber', e.target.value)}
                      placeholder="Enter your phone number"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      value={user?.email || ''}
                      disabled
                      className="bg-gray-50"
                    />
                    <p className="text-xs text-gray-500">Email cannot be changed here</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Role</Label>
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary">Administrator</Badge>
                    <span className="text-sm text-gray-500">Contact admin to change roles</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Preferences */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <SettingsIcon className="mr-2 h-5 w-5" />
                  Preferences
                </CardTitle>
                <CardDescription>
                  Customize your application experience
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base font-medium flex items-center">
                      <Mail className="mr-2 h-4 w-4" />
                      Email Notifications
                    </Label>
                    <p className="text-sm text-gray-600">Receive notifications via email</p>
                  </div>
                  <Switch
                    checked={userSettings.emailNotifications}
                    onCheckedChange={(checked) => updateSetting('emailNotifications', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base font-medium">Dashboard Layout</Label>
                    <p className="text-sm text-gray-600">Choose your preferred dashboard layout</p>
                  </div>
                  <Select
                    value={userSettings.dashboardLayout}
                    onValueChange={(value) => updateSetting('dashboardLayout', value)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="grid">Grid</SelectItem>
                      <SelectItem value="compact">Compact</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base font-medium flex items-center">
                      <Globe className="mr-2 h-4 w-4" />
                      Default Currency
                    </Label>
                    <p className="text-sm text-gray-600">Default currency for invoices</p>
                  </div>
                  <Select
                    value={userSettings.defaultCurrency || 'USD'}
                    onValueChange={(value) => updateSetting('defaultCurrency', value)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="MXN">MXN ($)</SelectItem>
                      <SelectItem value="COP">COP ($)</SelectItem>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                      <SelectItem value="GBP">GBP (£)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base font-medium flex items-center">
                      <Clock className="mr-2 h-4 w-4" />
                      Timezone
                    </Label>
                    <p className="text-sm text-gray-600">Your local timezone</p>
                  </div>
                  <Select
                    value={userSettings.timezone}
                    onValueChange={(value) => updateSetting('timezone', value)}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/New_York">Eastern Time (UTC-5)</SelectItem>
                      <SelectItem value="America/Chicago">Central Time (UTC-6)</SelectItem>
                      <SelectItem value="America/Denver">Mountain Time (UTC-7)</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time (UTC-8)</SelectItem>
                      <SelectItem value="America/Mexico_City">Mexico City (UTC-6)</SelectItem>
                      <SelectItem value="America/Bogota">Bogotá (UTC-5)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Key className="mr-2 h-5 w-5" />
                  Change Password
                </CardTitle>
                <CardDescription>
                  Update your account password
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      required
                    />
                  </div>

                  <Alert>
                    <AlertDescription>
                      Password must be at least 8 characters long and include letters, numbers, and symbols.
                    </AlertDescription>
                  </Alert>

                  <Button 
                    type="submit" 
                    disabled={changePasswordMutation.isPending}
                    className="w-full"
                  >
                    {changePasswordMutation.isPending ? "Updating..." : "Change Password"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Validation Tab */}
          <TabsContent value="validation" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <CheckCircle className="mr-2 h-5 w-5" />
                  Validation Settings
                </CardTitle>
                <CardDescription>
                  Configure invoice validation rules and preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center py-8">
                  <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-gray-600">
                    Validation settings are managed in the{" "}
                    <Button 
                      variant="link" 
                      className="p-0 h-auto text-blue-600"
                      onClick={() => window.location.href = '/validation-rules'}
                    >
                      Validation Rules
                    </Button>
                    {" "}section.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Tab */}
          <TabsContent value="ai" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Bot className="mr-2 h-5 w-5" />
                  AI Processing Settings
                </CardTitle>
                <CardDescription>
                  Configure how AI processes your invoices
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <Label className="text-base font-medium">AI Processing Mode</Label>
                  <div className="space-y-3">
                    <div 
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        userSettings.aiProcessingMode === 'automatic' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      }`}
                      onClick={() => updateSetting('aiProcessingMode', 'automatic')}
                    >
                      <div className="flex items-center space-x-3">
                        <input
                          type="radio"
                          checked={userSettings.aiProcessingMode === 'automatic'}
                          onChange={() => updateSetting('aiProcessingMode', 'automatic')}
                          className="text-blue-600"
                        />
                        <div>
                          <div className="font-medium">Automatic Processing</div>
                          <div className="text-sm text-gray-600">
                            AI automatically processes invoices upon upload
                          </div>
                        </div>
                      </div>
                    </div>

                    <div 
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        userSettings.aiProcessingMode === 'manual' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      }`}
                      onClick={() => updateSetting('aiProcessingMode', 'manual')}
                    >
                      <div className="flex items-center space-x-3">
                        <input
                          type="radio"
                          checked={userSettings.aiProcessingMode === 'manual'}
                          onChange={() => updateSetting('aiProcessingMode', 'manual')}
                          className="text-blue-600"
                        />
                        <div>
                          <div className="font-medium">Manual Processing</div>
                          <div className="text-sm text-gray-600">
                            You trigger AI processing manually for each invoice
                          </div>
                        </div>
                      </div>
                    </div>

                    <div 
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        userSettings.aiProcessingMode === 'batch' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      }`}
                      onClick={() => updateSetting('aiProcessingMode', 'batch')}
                    >
                      <div className="flex items-center space-x-3">
                        <input
                          type="radio"
                          checked={userSettings.aiProcessingMode === 'batch'}
                          onChange={() => updateSetting('aiProcessingMode', 'batch')}
                          className="text-blue-600"
                        />
                        <div>
                          <div className="font-medium">Batch Processing</div>
                          <div className="text-sm text-gray-600">
                            AI processes multiple invoices together at scheduled times
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Database className="mr-2 h-5 w-5" />
                  AI Cache Settings
                </CardTitle>
                <CardDescription>
                  Manage AI result caching to improve performance
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base font-medium">Enable Result Caching</Label>
                    <p className="text-sm text-gray-600">Cache AI processing results for faster retrieval</p>
                  </div>
                  <Switch
                    checked={userSettings.aiCacheEnabled}
                    onCheckedChange={(checked) => updateSetting('aiCacheEnabled', checked)}
                  />
                </div>

                {userSettings.aiCacheEnabled && (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base font-medium">Cache Expiry</Label>
                        <p className="text-sm text-gray-600">How long to keep cached results</p>
                      </div>
                      <Select
                        value={userSettings.aiCacheExpiry}
                        onValueChange={(value) => updateSetting('aiCacheExpiry', value)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1h">1 Hour</SelectItem>
                          <SelectItem value="6h">6 Hours</SelectItem>
                          <SelectItem value="24h">24 Hours</SelectItem>
                          <SelectItem value="7d">7 Days</SelectItem>
                          <SelectItem value="30d">30 Days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base font-medium">Auto Invalidation</Label>
                        <p className="text-sm text-gray-600">When to automatically clear cache</p>
                      </div>
                      <Select
                        value={userSettings.aiAutoInvalidation}
                        onValueChange={(value) => updateSetting('aiAutoInvalidation', value)}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="on_update">On invoice update</SelectItem>
                          <SelectItem value="never">Never</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Help Tab */}
          <TabsContent value="help" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <FileText className="mr-2 h-5 w-5 text-blue-600" />
                    User Guide
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4">
                    Comprehensive guide to using the invoice management platform
                  </p>
                  <Button variant="outline" className="w-full">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open User Guide
                  </Button>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Globe className="mr-2 h-5 w-5 text-green-600" />
                    API Documentation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4">
                    Developer documentation for API integration
                  </p>
                  <Button variant="outline" className="w-full">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View API Docs
                  </Button>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <HelpCircle className="mr-2 h-5 w-5 text-purple-600" />
                    Contact Support
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4">
                    Get help from our support team
                  </p>
                  <Button variant="outline" className="w-full">
                    <Mail className="mr-2 h-4 w-4" />
                    Contact Support
                  </Button>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Zap className="mr-2 h-5 w-5 text-yellow-600" />
                    System Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4">
                    Check current system status and uptime
                  </p>
                  <Button variant="outline" className="w-full">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    View Status
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Platform Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <Label className="font-medium">Version</Label>
                    <p className="text-gray-600">v2.1.0</p>
                  </div>
                  <div>
                    <Label className="font-medium">Support Email</Label>
                    <p className="text-gray-600">support@invoiceai.com</p>
                  </div>
                  <div>
                    <Label className="font-medium">System Uptime</Label>
                    <p className="text-green-600">99.9%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
