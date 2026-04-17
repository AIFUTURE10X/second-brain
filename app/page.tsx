import Brain from "@/components/Brain";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ToastContainer } from "@/components/Toast";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <ErrorBoundary>
      <Brain />
      <ToastContainer />
    </ErrorBoundary>
  );
}
