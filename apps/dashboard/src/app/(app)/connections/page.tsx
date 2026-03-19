import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ConnectionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Connections</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your Shopify and accounting integrations.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Shopify</CardTitle>
              <Badge variant="outline" className="text-gray-400 border-gray-200">
                Not connected
              </Badge>
            </div>
            <CardDescription>Connect your store to let Kommand access orders, products, and analytics.</CardDescription>
          </CardHeader>
          <CardContent>
            <a
              href="/onboarding"
              className="text-sm font-medium text-primary hover:underline"
            >
              Connect store →
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Xero</CardTitle>
              <Badge variant="outline" className="text-gray-400 border-gray-200">
                Not connected
              </Badge>
            </div>
            <CardDescription>Connect Xero for invoices, bills, and financial reports.</CardDescription>
          </CardHeader>
          <CardContent>
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL}/webhooks/xero/connect`}
              className="text-sm font-medium text-primary hover:underline"
            >
              Connect Xero →
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
