import "server-only";
import { sql } from "./db";
import type { WsContext } from "./access";
import type { DocNode } from "@/components/DocTree";

export async function listDocs(ctx: WsContext): Promise<DocNode[]> {
  return sql<DocNode[]>`select d.id, d.parent_id, d.title, d.icon, d.is_folder, d.category, d.updated_at, d.visibility, p.name as project_name,
      document_access_level(${ctx.user.id}, d.id) as level
    from documents d left join projects p on p.id = d.project_id
    where d.workspace_id = ${ctx.ws.id} and document_access_level(${ctx.user.id}, d.id) >= 1 order by d.title`;
}
