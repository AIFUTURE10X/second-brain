import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Brain from "@/components/Brain";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (!session) redirect("/login");

  return <Brain userName={session.user?.name || undefined} />;
}
