import { MeetingsView } from "@/components/phase1-live";
import { DemoShowcase } from "@/components/demo-showcase";

export default function Meetings() {
  return (
    <div className="space-y-8">
      <DemoShowcase />
      <MeetingsView />
    </div>
  );
}
