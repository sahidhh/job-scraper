import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ThresholdsCardProps {
  keywordThreshold: string;
  notifyThreshold: string;
}

export function ThresholdsCard({ keywordThreshold, notifyThreshold }: ThresholdsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Scoring thresholds</CardTitle>
        <CardDescription>Configured via environment variables (scoring.md §5).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">KEYWORD_THRESHOLD</span>
          <span className="font-medium">{keywordThreshold}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">NOTIFY_THRESHOLD</span>
          <span className="font-medium">{notifyThreshold}</span>
        </div>
      </CardContent>
    </Card>
  );
}
