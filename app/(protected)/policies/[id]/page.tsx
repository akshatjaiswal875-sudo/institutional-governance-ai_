import { PolicyDetailView } from "@/components/phase1-live";
import { PolicyVersioningPanel } from "@/components/policies/PolicyVersioningPanel";

export default function PolicyDetail({ params }: { params: { id: string } }) {
  return (
    <>
      <PolicyDetailView />
      <PolicyVersioningPanel policyId={params.id} />
    </>
  );
}
