import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ChatLogPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Chat Log</h1>
        <p className="text-sm text-gray-500 mt-1">
          Every agent run — messages, tools used, and results.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardContent className="py-16 text-center">
          <p className="text-gray-400 text-sm">No agent runs yet.</p>
          <p className="text-gray-400 text-sm mt-1">
            Send a WhatsApp message to Kommand to get started.
          </p>
          <Badge variant="outline" className="mt-4 text-gray-400">
            Waiting for first message
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}
