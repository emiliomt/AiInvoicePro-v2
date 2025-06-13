
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Bell, Shield, Palette, Globe, HardDrive, Zap } from "lucide-react";
import Header from "@/components/Header";

export default function Settings() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-2">Manage your application preferences and account settings</p>
        </div>

        <div className="space-y-8">
          {/* Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Bell className="mr-2 h-5 w-5" />
                Notifications
              </CardTitle>
              <CardDescription>
                Configure how you receive notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Email Notifications</Label>
                  <p className="text-sm text-gray-600">Receive notifications via email</p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Invoice Alerts</Label>
                  <p className="text-sm text-gray-600">Get notified when new invoices require attention</p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Approval Reminders</Label>
                  <p className="text-sm text-gray-600">Receive reminders for pending approvals</p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">System Updates</Label>
                  <p className="text-sm text-gray-600">Get notified about system maintenance and updates</p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Shield className="mr-2 h-5 w-5" />
                Security & Privacy
              </CardTitle>
              <CardDescription>
                Manage your security preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Two-Factor Authentication</Label>
                  <p className="text-sm text-gray-600">Add an extra layer of security to your account</p>
                </div>
                <Button variant="outline" size="sm">Configure</Button>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Session Timeout</Label>
                  <p className="text-sm text-gray-600">Automatically log out after inactivity</p>
                </div>
                <Select defaultValue="30">
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                    <SelectItem value="240">4 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Data Privacy</Label>
                  <p className="text-sm text-gray-600">Control how your data is used</p>
                </div>
                <Button variant="outline" size="sm">Manage</Button>
              </div>
            </CardContent>
          </Card>

          {/* Appearance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Palette className="mr-2 h-5 w-5" />
                Appearance
              </CardTitle>
              <CardDescription>
                Customize the look and feel of the application
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Theme</Label>
                  <p className="text-sm text-gray-600">Choose your preferred theme</p>
                </div>
                <Select defaultValue="light">
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Compact Mode</Label>
                  <p className="text-sm text-gray-600">Use more compact layouts</p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>

          {/* Language & Region */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Globe className="mr-2 h-5 w-5" />
                Language & Region
              </CardTitle>
              <CardDescription>
                Set your language and regional preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Language</Label>
                  <p className="text-sm text-gray-600">Select your preferred language</p>
                </div>
                <Select defaultValue="en">
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="de">Deutsch</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Currency</Label>
                  <p className="text-sm text-gray-600">Default currency for invoices</p>
                </div>
                <Select defaultValue="usd">
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usd">USD ($)</SelectItem>
                    <SelectItem value="eur">EUR (€)</SelectItem>
                    <SelectItem value="gbp">GBP (£)</SelectItem>
                    <SelectItem value="cad">CAD ($)</SelectItem>
                    <SelectItem value="cop">COP ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Date Format</Label>
                  <p className="text-sm text-gray-600">How dates are displayed</p>
                </div>
                <Select defaultValue="mdy">
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mdy">MM/DD/YYYY</SelectItem>
                    <SelectItem value="dmy">DD/MM/YYYY</SelectItem>
                    <SelectItem value="ymd">YYYY-MM-DD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Advanced */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Zap className="mr-2 h-5 w-5" />
                Advanced
              </CardTitle>
              <CardDescription>
                Advanced application settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Debug Mode</Label>
                  <p className="text-sm text-gray-600">Enable additional logging and debugging features</p>
                </div>
                <Switch />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Export Data</Label>
                  <p className="text-sm text-gray-600">Download all your data</p>
                </div>
                <Button variant="outline" size="sm">
                  <HardDrive className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium text-red-600">Delete Account</Label>
                  <p className="text-sm text-gray-600">Permanently delete your account and data</p>
                </div>
                <Button variant="destructive" size="sm">Delete</Button>
              </div>
            </CardContent>
          </Card>

          {/* Save Settings */}
          <div className="flex justify-end space-x-4">
            <Button variant="outline">Reset to Defaults</Button>
            <Button>Save All Settings</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
