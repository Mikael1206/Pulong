import { Video } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 gap-6 text-center">
      <div className="flex items-center gap-3">
        <Video className="w-10 h-10" />
        <h1 className="text-4xl font-bold">Pulong</h1>
      </div>
      <p className="max-w-md text-sm text-foreground/70">
        Free, open-source, unlimited-duration video meetings. No accounts, no
        time limits, no cost. Room creation and joining land in the next
        build step.
      </p>
    </div>
  );
}
