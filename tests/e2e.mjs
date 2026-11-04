// Prueba funcional de extremo a extremo de los criterios de aceptación.
// Uso: servidor corriendo en BASE_URL (por defecto http://localhost:3000) y DATABASE_URL accesible.
//   node tests/e2e.mjs
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
// Usa playwright local si existe; si no, el instalado globalmente.
const require = createRequire(import.meta.url);
let pw; try { pw = require("playwright"); } catch { pw = require(`${execSync("npm root -g").toString().trim()}/playwright`); }
const { chromium, devices } = pw;
import postgres from "postgres";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, existsSync } from "node:fs";

for (const f of [".env.local", ".env"]) if (existsSync(f)) for (const l of readFileSync(f, "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const sql = postgres(process.env.DATABASE_URL, { max: 2 });
const OUT = "tests/output"; mkdirSync(OUT, { recursive: true });
const run = Date.now().toString(36);
const ana = { name: "Ana Torres", email: `ana.${run}@test.dev`, password: "Secreta123" };
const bruno = { name: "Bruno Díaz", email: `bruno.${run}@test.dev`, password: "Secreta456" };
const carla = { name: "Carla Ruiz", email: `carla.${run}@test.dev`, password: "Secreta789" };
const intruder = { name: "Iván Externo", email: `ivan.${run}@test.dev`, password: "Secreta000" };

let passed = 0; const failures = [];
async function step(name, fn) {
  try { await fn(); passed++; console.log(`  ✔ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✘ ${name}\n      ${String(e?.message ?? e).split("\n").slice(0, 4).join("\n      ")}`); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }

const browser = await chromium.launch();
async function newUser() { const ctx = await browser.newContext({ baseURL: BASE }); return { ctx, page: await ctx.newPage() }; }
async function register(page, u, next = "") {
  await page.goto(`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await page.fill("#name", u.name); await page.fill("#email", u.email); await page.fill("#password", u.password);
  await page.click("button[type=submit]");
}

const A = await newUser(), B = await newUser(), C = await newUser(), X = await newUser();
let slug, projectUrl, projectId, privateId, inviteLink, guestLink, shareLink;

console.log("\nOrbita · pruebas funcionales\n");
// Las pruebas registran varios usuarios desde la misma IP: reiniciar el limitador de intentos.
await sql`delete from login_attempts`;

await step("Registro de usuario y redirección a creación de espacio", async () => {
  await register(A.page, ana);
  await A.page.waitForURL(/\/onboarding/);
});

await step("Validación: contraseña corta rechazada", async () => {
  const { page } = await newUser();
  await page.goto("/register"); await page.fill("#name", "X"); await page.fill("#email", "bad@test.dev"); await page.fill("#password", "123");
  await page.evaluate(() => document.querySelectorAll("input").forEach((i) => { i.removeAttribute("minlength"); }));
  await page.click("button[type=submit]");
  await page.getByText(/al menos/).first().waitFor({ timeout: 5000 });
});

await step("El administrador crea un espacio de trabajo", async () => {
  await A.page.fill("#name", "Acme Marketing");
  await A.page.click("button[type=submit]");
  await A.page.waitForURL(/\/w\/acme-marketing-/);
  slug = new URL(A.page.url()).pathname.split("/")[2];
  const [r] = await sql`select wm.role from workspace_members wm join workspaces w on w.id = wm.workspace_id join users u on u.id = wm.user_id where w.slug = ${slug} and u.email = ${ana.email}`;
  assert(r?.role === "admin", "Ana debería ser administradora");
});

await step("Cerrar sesión e iniciar sesión nuevamente", async () => {
  await A.page.click("button[aria-label='Menú de usuario']");
  await A.page.click("text=Cerrar sesión");
  await A.page.waitForURL(/\/login/);
  await A.page.fill("#email", ana.email); await A.page.fill("#password", "incorrecta");
  await A.page.click("button[type=submit]");
  await A.page.getByText("Correo o contraseña incorrectos").waitFor();
  await A.page.fill("#password", ana.password);
  await A.page.click("button[type=submit]");
  await A.page.waitForURL(new RegExp(`/w/${slug}`));
});

await step("Invitar a un colaborador por correo (enlace generado)", async () => {
  await A.page.goto(`/w/${slug}/members`);
  await A.page.fill("input[name=email]", bruno.email);
  await A.page.selectOption("select[name=role]", "member");
  await A.page.click("text=Enviar invitación");
  const field = A.page.locator("input[readonly]").first();
  await field.waitFor();
  inviteLink = await field.inputValue();
  assert(inviteLink.includes("/invite/"), "debe generar enlace de invitación");
  await A.page.getByText(bruno.email).first().waitFor();
});

await step("Crear proyecto con responsable, fechas, prioridad y categoría", async () => {
  await A.page.goto(`/w/${slug}/projects/new`);
  await A.page.fill("#pf-name", "Lanzamiento Web");
  await A.page.fill("#pf-desc", "Nuevo sitio corporativo");
  await A.page.fill("#pf-obj", "Publicar sitio\nAumentar leads 20%");
  await A.page.fill("#pf-cat", "Marketing");
  await A.page.selectOption("#pf-prio", "high");
  await A.page.fill("#pf-start", "2026-11-01");
  await A.page.fill("#pf-end", "2026-12-15");
  await A.page.click("text=Crear proyecto");
  await A.page.waitForURL(/\/projects\/[0-9a-f-]{36}/);
  projectUrl = A.page.url(); projectId = projectUrl.split("/projects/")[1].split("?")[0];
  await A.page.getByRole("heading", { name: "Lanzamiento Web" }).waitFor();
});

await step("El colaborador se registra desde la invitación y la acepta", async () => {
  await B.page.goto(inviteLink);
  await B.page.click("text=Crear cuenta y unirme");
  await B.page.fill("#name", bruno.name); await B.page.fill("#password", bruno.password);
  await B.page.click("button[type=submit]");
  await B.page.waitForURL(/\/invite\//);
  await B.page.click("text=Aceptar invitación");
  await B.page.waitForURL(new RegExp(`/w/${slug}$`));
});

await step("Crear tareas con responsable, prioridad y fecha límite (vista lista)", async () => {
  await A.page.goto(`${projectUrl}?view=list`);
  const add = async (title, assignee, prio, due) => {
    await A.page.fill("input[name=title]", title);
    await A.page.selectOption("select[name=assigneeId]", { label: assignee });
    await A.page.selectOption("select[name=priority]", prio);
    if (due) await A.page.fill("input[name=dueDate]", due);
    await A.page.click("button:has-text('Añadir')");
    await A.page.locator(`[data-task-row="${title}"]`).waitFor();
  };
  await add("Diseñar maqueta", bruno.name, "high", "2026-11-03");
  await add("Redactar contenidos", ana.name, "medium", "2026-11-20");
  await add("Configurar hosting", bruno.name, "low", "");
  const [{ n }] = await sql`select count(*)::int n from tasks where project_id = ${projectId}`;
  assert(n === 3, `esperaba 3 tareas en BD, hay ${n}`);
});

await step("Editar tarea en el panel de detalle (estado, título, colaboradores) y queda en historial", async () => {
  const [t] = await sql`select id from tasks where project_id = ${projectId} and title = 'Redactar contenidos'`;
  await A.page.goto(`${projectUrl}?view=list&task=${t.id}`);
  const drawer = A.page.getByTestId("task-drawer");
  await drawer.waitFor();
  await drawer.locator("input[name=title]").fill("Redactar contenidos v2");
  await drawer.locator("#te-status").selectOption("in_review");
  await drawer.locator("label", { hasText: "Bruno" }).click();
  await drawer.locator("button:has-text('Guardar cambios')").click();
  let r;
  for (let i = 0; i < 20; i++) {
    [r] = await sql`select title, status, (select count(*)::int from task_collaborators c where c.task_id = tasks.id) as c from tasks where id = ${t.id}`;
    if (r.status === "in_review") break;
    await A.page.waitForTimeout(300);
  }
  assert(r.title === "Redactar contenidos v2" && r.status === "in_review" && r.c === 1, JSON.stringify(r));
  await A.page.reload();
  await drawer.getByText(/cambió el estado a En revisión/).first().waitFor();
});

await step("Subtareas y checklist", async () => {
  const [t] = await sql`select id from tasks where project_id = ${projectId} and title = 'Diseñar maqueta'`;
  await A.page.goto(`${projectUrl}?task=${t.id}`);
  const drawer = A.page.getByTestId("task-drawer");
  await drawer.locator("button:has-text('Añadir tarea')").click();
  await drawer.locator("input[placeholder='Nueva subtarea…']").fill("Wireframe móvil");
  await drawer.locator("button:has-text('Añadir'):not(:has-text('tarea'))").first().click();
  await drawer.getByText("Wireframe móvil").waitFor();
  await drawer.locator("input[name=text]").fill("Revisar paleta");
  await drawer.locator("input[name=text]").press("Enter");
  await drawer.getByText("Revisar paleta").waitFor();
  const [{ n }] = await sql`select count(*)::int n from checklist_items where task_id = ${t.id}`;
  assert(n === 1, "checklist guardado");
});

await step("Comentario con mención genera notificación al usuario mencionado", async () => {
  const [t] = await sql`select id from tasks where project_id = ${projectId} and title = 'Diseñar maqueta'`;
  await A.page.goto(`${projectUrl}?task=${t.id}`);
  const ta = A.page.getByTestId("task-drawer").locator("textarea[name=body]");
  await ta.click(); await ta.type("Hola @Bru");
  await A.page.locator("[role=listbox] button", { hasText: "Bruno" }).click();
  await ta.type("revisa por favor");
  await A.page.getByTestId("task-drawer").locator("button:has-text('Comentar')").click();
  await A.page.getByTestId("task-drawer").locator(".mention", { hasText: "@Bruno Díaz" }).waitFor();
  const [n] = await sql`select n.title from notifications n join users u on u.id = n.user_id where u.email = ${bruno.email} and n.kind = 'mention'`;
  assert(n, "Bruno debe tener notificación de mención");
});

await step("Tablero Kanban: arrastrar y soltar cambia el estado y se persiste", async () => {
  await A.page.goto(`${projectUrl}?view=board`);
  const card = A.page.locator("[data-task-id]", { hasText: "Configurar hosting" });
  const target = A.page.locator("[data-column=in_progress]");
  await card.waitFor();
  const cb = await card.boundingBox(), tb = await target.boundingBox();
  await A.page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await A.page.mouse.down();
  await A.page.mouse.move(cb.x + cb.width / 2 + 20, cb.y + cb.height / 2 + 5, { steps: 5 });
  await A.page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height - 30, { steps: 15 });
  await A.page.mouse.up();
  await A.page.waitForTimeout(1500);
  const [r] = await sql`select status from tasks where project_id = ${projectId} and title = 'Configurar hosting'`;
  assert(r.status === "in_progress", `estado en BD: ${r.status}`);
  await A.page.reload();
  await A.page.locator("[data-column=in_progress] [data-task-id]", { hasText: "Configurar hosting" }).waitFor();
});

await step("Vista calendario muestra tareas con fecha", async () => {
  await A.page.goto(`${projectUrl}?view=calendar&month=2026-11`);
  await A.page.getByText("Diseñar maqueta").first().waitFor();
  await A.page.goto(`/w/${slug}/calendar?mode=week&date=2026-11-03`);
  await A.page.getByText("Diseñar maqueta").first().waitFor();
  await A.page.goto(`/w/${slug}/calendar?mode=planning&date=2026-11-02`);
  await A.page.getByText("Diseñar maqueta").first().waitFor();
});

await step("El colaborador ve el proyecto y sus tareas asignadas, y puede completarlas", async () => {
  await B.page.goto(`/w/${slug}/tasks`);
  await B.page.getByText("Diseñar maqueta").first().waitFor();
  await B.page.locator("[data-task-row='Diseñar maqueta'] button[aria-label='Marcar como completada']").click();
  await B.page.waitForTimeout(1000);
  const [r] = await sql`select status, completed_at from tasks where project_id = ${projectId} and title = 'Diseñar maqueta'`;
  assert(r.status === "done" && r.completed_at, "tarea completada por Bruno");
});

await step("Dashboard refleja los cambios reales", async () => {
  await A.page.goto(`/w/${slug}`);
  const done = await A.page.getByTestId("kpi-Completadas").innerText();
  const [{ n }] = await sql`select count(*)::int n from tasks where workspace_id = (select id from workspaces where slug = ${slug}) and status = 'done'`;
  assert(Number(done) === n && n >= 1, `KPI ${done} vs BD ${n}`);
  await A.page.getByText("Lanzamiento Web").first().waitFor();
  await A.page.getByText("Carga de trabajo").waitFor();
});

await step("Proyecto privado: el colaborador no puede acceder (404) ni verlo en listas", async () => {
  await A.page.goto(`/w/${slug}/projects/new`);
  await A.page.fill("#pf-name", "Proyecto Confidencial");
  await A.page.selectOption("#pf-vis", "private");
  await A.page.click("text=Crear proyecto");
  await A.page.waitForURL(/\/projects\/[0-9a-f-]{36}/);
  privateId = A.page.url().split("/projects/")[1].split("?")[0];
  const res = await B.page.goto(`/w/${slug}/projects/${privateId}`);
  assert(res.status() === 404, `status ${res.status()}`);
  await B.page.goto(`/w/${slug}/projects`);
  assert(!(await B.page.getByText("Proyecto Confidencial").count()), "no debe aparecer en la lista");
  const csv = await (await B.ctx.request.get(`/api/export?ws=${(await sql`select id from workspaces where slug = ${slug}`)[0].id}&type=projects`)).text();
  assert(!csv.includes("Confidencial"), "no debe exportarse");
});

await step("Permisos en backend: el colaborador no puede editar un proyecto ajeno (lectura)", async () => {
  await B.page.goto(`${projectUrl}?view=list`);
  assert(!(await B.page.locator("input[placeholder='Nueva tarea…']").count()), "no debe mostrar formulario de alta");
  // Intento directo a la ruta de adjuntos (backend) sin permisos de edición
  const wsId = (await sql`select id from workspaces where slug = ${slug}`)[0].id;
  const r = await B.ctx.request.post("/api/attachments", { headers: { origin: BASE }, multipart: { workspaceId: wsId, entityType: "project", entityId: projectId, file: { name: "x.txt", mimeType: "text/plain", buffer: Buffer.from("hola") } } });
  assert(r.status() === 403, `esperaba 403, obtuvo ${r.status()}`);
});

await step("Usuario ajeno al espacio no puede ver el espacio ni descargar archivos", async () => {
  await register(X.page, intruder);
  await X.page.waitForURL(/\/onboarding/);
  const r = await X.page.goto(`/w/${slug}`);
  assert(r.status() === 404, `status ${r.status()}`);
  const s = await X.ctx.request.get(`/api/sync?ws=${(await sql`select id from workspaces where slug = ${slug}`)[0].id}`);
  assert(s.status() === 403, "sync denegado");
});

await step("Adjuntar archivo a un proyecto y descargarlo con control de acceso", async () => {
  await A.page.goto(`${projectUrl}?view=files`);
  await A.page.getByTestId("file-input").first().setInputFiles({ name: "brief.txt", mimeType: "text/plain", buffer: Buffer.from("Brief del proyecto") });
  await A.page.getByText("brief.txt").first().waitFor();
  const [att] = await sql`select id from attachments where entity_id = ${projectId}`;
  const ok = await B.ctx.request.get(`/api/attachments/${att.id}`);
  assert(ok.status() === 200 && (await ok.text()) === "Brief del proyecto", "colaborador con lectura puede descargar");
  const no = await X.ctx.request.get(`/api/attachments/${att.id}`);
  assert(no.status() === 404, "usuario ajeno no puede descargar");
});

await step("Compartir proyecto con invitado externo (sólo ese proyecto)", async () => {
  await A.page.goto(`${projectUrl}?view=people`);
  const form = A.page.locator("form", { has: A.page.locator("input[name=email]") });
  await form.locator("input[name=email]").fill(carla.email);
  await form.locator("select[name=projectRole]").selectOption("viewer");
  await form.locator("button:has-text('Invitar')").click();
  const f = A.page.locator("input[readonly][value*='/invite/']").first();
  await f.waitFor(); guestLink = await f.inputValue();
  await register(C.page, carla, new URL(guestLink).pathname);
  await C.page.waitForURL(/\/invite\//);
  await C.page.click("text=Aceptar invitación");
  await C.page.waitForURL(new RegExp(`/projects/${projectId}`));
  const r = await C.page.goto(`/w/${slug}/projects/${privateId}`);
  assert(r.status() === 404, "invitado no ve proyecto privado");
  await C.page.goto(`/w/${slug}/projects`);
  await C.page.getByText("Lanzamiento Web").first().waitFor();
  assert(!(await C.page.locator("a[href$='/teams']").count()), "invitado no ve Equipos");
  const t = await C.page.goto(`/w/${slug}/teams`);
  assert(t.status() === 404, "invitado no accede a equipos");
});

await step("Enlace público de sólo lectura: funciona sin sesión y se puede revocar", async () => {
  await A.page.goto(`${projectUrl}?view=people`);
  await A.page.click("text=Crear enlace público");
  const f = A.page.locator("input[readonly][value*='/share/']").first();
  await f.waitFor(); shareLink = await f.inputValue();
  const anon = await browser.newContext();
  const p = await anon.newPage();
  await p.goto(shareLink);
  await p.getByText("Lanzamiento Web").first().waitFor();
  const html = await p.content();
  assert(!html.includes(ana.email) && !html.includes("Confidencial") && !html.includes("revisa por favor"), "no debe exponer correos, otros proyectos ni comentarios");
  A.page.once("dialog", (d) => d.accept());
  await A.page.click("text=Revocar");
  await A.page.waitForTimeout(1500);
  const r = await p.goto(shareLink);
  assert(r.status() === 404, "enlace revocado");
  await anon.close();
});

await step("Revocar el acceso de un miembro", async () => {
  await A.page.goto(`/w/${slug}/members`);
  A.page.once("dialog", (d) => d.accept());
  await A.page.locator(`[data-member="${carla.email}"] button:has-text('Revocar')`).click();
  await A.page.waitForTimeout(1200);
  const r = await C.page.goto(`/w/${slug}`);
  assert(r.status() === 404, "Carla ya no debe acceder");
});

await step("Equipos: crear equipo, asignar líder e integrantes", async () => {
  await A.page.goto(`/w/${slug}/teams`);
  await A.page.click("button:has-text('Nuevo equipo')");
  await A.page.fill("#t-name", "Diseño");
  await A.page.click("text=Crear equipo");
  await A.page.waitForURL(/\/teams\/[0-9a-f-]{36}/);
  await A.page.selectOption("select[name=userId]", { label: bruno.name });
  await A.page.click("button:has-text('Añadir'):visible");
  await A.page.getByText(bruno.name).first().waitFor();
  await A.page.locator("li", { hasText: bruno.name }).locator("button[title='Nombrar líder'], button:has(span[title='Nombrar líder'])").first().click();
  await A.page.waitForTimeout(1000);
  const [r] = await sql`select tm.is_leader, wm.role from team_members tm join users u on u.id = tm.user_id join workspace_members wm on wm.user_id = u.id where u.email = ${bruno.email}`;
  assert(r.is_leader && r.role === "leader", JSON.stringify(r));
});

await step("Documentos: crear página con tabla y lista, guardar y versionar", async () => {
  await A.page.goto(`/w/${slug}/docs`);
  await A.page.click("button:has-text('Página')");
  await A.page.waitForURL(/\/docs\/[0-9a-f-]{36}/);
  await A.page.fill("input[aria-label='Título del documento']", "Guía de marca");
  await A.page.fill("textarea[aria-label='Contenido (Markdown)']", "# Colores\n\n- Azul\n- Blanco\n\n| Uso | Color |\n| --- | --- |\n| Primario | Azul |");
  await A.page.click("button:has-text('Guardar')");
  await A.page.getByTestId("save-status").filter({ hasText: "Guardado" }).waitFor();
  await A.page.reload();
  await A.page.locator(".prose-doc table td", { hasText: "Primario" }).waitFor();
  await A.page.fill("textarea[aria-label='Contenido (Markdown)']", "# Colores v2");
  await A.page.click("button:has-text('Guardar')");
  await A.page.getByTestId("save-status").filter({ hasText: "Guardado" }).waitFor();
  const [{ n }] = await sql`select count(*)::int n from document_versions dv join documents d on d.id = dv.document_id where d.title = 'Guía de marca'`;
  assert(n >= 1, "debe existir historial de versiones");
});

await step("Recuperación de contraseña con token", async () => {
  const token = randomBytes(32).toString("base64url");
  const [u] = await sql`select id from users where email = ${intruder.email}`;
  await sql`insert into password_resets (token_hash, user_id, expires_at) values (${createHash("sha256").update(token).digest("hex")}, ${u.id}, now() + interval '1 hour')`;
  const { page } = await newUser();
  await page.goto("/forgot-password"); await page.fill("#email", intruder.email); await page.click("button[type=submit]");
  await page.getByText(/Si existe una cuenta/).waitFor();
  await page.goto(`/reset-password/${token}`);
  await page.fill("#password", "NuevaClave2026"); await page.click("button[type=submit]");
  await page.waitForURL(/\/onboarding/);
  const old = await X.page.goto(`/onboarding`);
  assert(old.url().includes("/login"), "las sesiones anteriores deben cerrarse tras el reset");
  const reuse = await newUser();
  await reuse.page.goto(`/reset-password/${token}`); await reuse.page.fill("#password", "OtraClave2026"); await reuse.page.click("button[type=submit]");
  await reuse.page.getByText(/no es válido o ha caducado/).waitFor();
});

await step("Notificaciones visibles para el usuario y marcar como leídas", async () => {
  await B.page.goto(`/w/${slug}/notifications`);
  await B.page.locator("[data-notification]").first().waitFor();
  await B.page.click("text=Marcar todas como leídas");
  await B.page.waitForTimeout(800);
  const [{ n }] = await sql`select count(*)::int n from notifications n join users u on u.id = n.user_id where u.email = ${bruno.email} and read_at is null`;
  assert(n === 0, "todas leídas");
});

await step("Sincronización: un cambio de otro usuario aparece sin recargar (≤ 12 s)", async () => {
  await B.page.goto(`${projectUrl}?view=list`);
  const [t] = await sql`select id from tasks where project_id = ${projectId} and title = 'Configurar hosting'`;
  await sql`update tasks set title = 'Configurar hosting y dominio' where id = ${t.id}`;
  const [w] = await sql`select id from workspaces where slug = ${slug}`;
  await sql`insert into activity_log (workspace_id, project_id, entity_type, entity_id, action, summary) values (${w.id}, ${projectId}, 'task', ${t.id}, 'task.updated', 'prueba de sincronización')`;
  await B.page.getByText("Configurar hosting y dominio").first().waitFor({ timeout: 13000 });
});

await step("Interfaz responsive en smartphone (sin desbordamiento horizontal)", async () => {
  const m = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE, storageState: await A.ctx.storageState() });
  const p = await m.newPage();
  for (const path of [`/w/${slug}`, `${new URL(projectUrl).pathname}?view=board`, `/w/${slug}/calendar`]) {
    await p.goto(path);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(overflow <= 1, `${path} desborda ${overflow}px`);
  }
  await p.goto(`/w/${slug}`); await p.screenshot({ path: `${OUT}/mobile-dashboard.png`, fullPage: true });
  await p.goto(`${new URL(projectUrl).pathname}?view=board`); await p.screenshot({ path: `${OUT}/mobile-board.png` });
  await p.click("button[aria-label='Abrir menú']"); await p.locator("a:visible", { hasText: "Documentos" }).first().waitFor();
  await m.close();
});

await step("Capturas de escritorio", async () => {
  await A.page.setViewportSize({ width: 1440, height: 900 });
  await A.page.goto(`/w/${slug}`); await A.page.screenshot({ path: `${OUT}/desktop-dashboard.png`, fullPage: true });
  await A.page.goto(`${projectUrl}?view=board`); await A.page.screenshot({ path: `${OUT}/desktop-board.png` });
  await A.page.goto(`${projectUrl}?view=overview`); await A.page.screenshot({ path: `${OUT}/desktop-project.png`, fullPage: true });
  await A.page.goto(`/w/${slug}/calendar?mode=month&date=2026-11-01`); await A.page.screenshot({ path: `${OUT}/desktop-calendar.png` });
});

console.log(`\n${passed} pasaron, ${failures.length} fallaron${failures.length ? `: ${failures.join(" | ")}` : ""}\n`);
await browser.close(); await sql.end();
process.exit(failures.length ? 1 : 0);
