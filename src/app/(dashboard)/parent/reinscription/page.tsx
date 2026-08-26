import { Suspense } from "react";
import { ParentReinscriptionClient } from "@/components/reinscription/ParentReinscriptionClient";

export default function ParentReinscriptionPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
      <ParentReinscriptionClient />
    </Suspense>
  );
}
