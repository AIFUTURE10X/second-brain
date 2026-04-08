import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import Brain from "@/components/Brain";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <Brain userName={session.user?.name || undefined} />;
}
