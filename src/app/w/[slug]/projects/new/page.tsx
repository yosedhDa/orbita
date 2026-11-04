import { notFound } from "next/navigation";
import { canCreateProjects, getWsContext } from "@/lib/access";
import { listMembers } from "@/lib/queries";
import { sql } from "@/lib/db";
import { createProject } from "@/actions/projects";
import { ProjectForm } from "@/components/ProjectForm";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Nuevo proyecto" };

export default async function NewProject({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getWsContext(slug);
  if (!canCreateProjects(ctx.role)) notFound();
  const [members, teams, cats] = await Promise.all([
    listMembers(ctx.ws.id),
    sql<{ id: string; name: string }[]>`select id, name from teams where workspace_id = ${ctx.ws.id} order by name`,
    sql<{ category: string }[]>`select distinct category from projects where workspace_id = ${ctx.ws.id} and category <> ''`,
  ]);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Nuevo proyecto" subtitle="Define el alcance, responsables y fechas." />
      <div className="card p-5 sm:p-6">
        <ProjectForm action={createProject} workspaceId={ctx.ws.id} members={members.filter((m) => m.role !== "guest")} teams={teams} categories={cats.map((c) => c.category)} />
      </div>
    </div>
  );
}
