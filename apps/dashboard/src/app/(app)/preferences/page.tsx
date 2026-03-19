"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

export default function PreferencesPage() {
  const [dailyBrief, setDailyBrief] = useState(false);
  const [anomalyAlerts, setAnomalyAlerts] = useState(false);
  const [lowInventory, setLowInventory] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Preferences</h1>
        <p className="text-sm text-gray-500 mt-1">Configure how Kommand works for you.</p>
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">Notifications</CardTitle>
          <CardDescription>Choose what Kommand proactively sends you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="daily-brief" className="font-normal cursor-pointer">
              Daily business brief
            </Label>
            <Switch id="daily-brief" checked={dailyBrief} onCheckedChange={setDailyBrief} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <Label htmlFor="anomaly-alerts" className="font-normal cursor-pointer">
              Anomaly alerts
            </Label>
            <Switch id="anomaly-alerts" checked={anomalyAlerts} onCheckedChange={setAnomalyAlerts} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <Label htmlFor="low-inventory" className="font-normal cursor-pointer">
              Low inventory warnings
            </Label>
            <Switch id="low-inventory" checked={lowInventory} onCheckedChange={setLowInventory} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
