import Brain from "@/components/Brain";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ToastContainer } from "@/components/Toast";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import DesktopAppLauncher from "@/components/DesktopAppLauncher";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <ErrorBoundary>
      <DesktopAppLauncher />
      <Brain />
      <ToastContainer />
      <ServiceWorkerRegister />
    </ErrorBoundary>
  );
}
