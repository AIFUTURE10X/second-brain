import Brain from "@/components/Brain";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ToastContainer } from "@/components/Toast";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <ErrorBoundary>
      <Brain />
      <ToastContainer />
      <ServiceWorkerRegister />
    </ErrorBoundary>
  );
}
