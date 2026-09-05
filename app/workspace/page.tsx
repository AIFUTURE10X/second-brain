import Workspace from '@/components/workspace/Workspace';
import ErrorBoundary from '@/components/ErrorBoundary';

export const dynamic = 'force-dynamic';

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ cards?: string; tab?: string }> }) {
  const query = await searchParams;
  const ids = (query.cards || '').split(',').filter(id => /^[0-9a-f-]{36}$/i.test(id));
  return <ErrorBoundary><Workspace initialCards={ids} initialTab={query.tab} /></ErrorBoundary>;
}
