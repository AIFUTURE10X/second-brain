import ErrorBoundary from "@/components/ErrorBoundary";
import { ToastContainer } from "@/components/Toast";
import { SettingsShell } from "@/components/settings/SettingsShell";

// The shell reads ?section= from the URL, so this route is rendered on demand
// (same convention as the card grid at /).
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <ErrorBoundary>
      <SettingsShell />
      <ToastContainer />
    </ErrorBoundary>
  );
}
