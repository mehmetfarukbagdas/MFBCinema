import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Missing Supabase function environment variables" }, 500);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  const jwt = authorization.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Authentication required" }, 401);

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: authError } = await callerClient.auth.getUser(jwt);
  const caller = userData.user;
  if (authError || !caller) return json({ error: "Invalid session" }, 401);

  const { data: callerRoles, error: roleError } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id);
  if (roleError) return json({ error: "Could not verify administrator role" }, 500);
  if (!callerRoles?.some((row) => row.role === "admin")) {
    return json({ error: "Administrator permission required" }, 403);
  }

  let payload: { action?: string; userId?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = payload.action;
  const userId = payload.userId;

  if (action === "list") {
    const users: Array<{ id: string; email: string; created_at: string; role: "admin" | "user" }> =
      [];
    let page = 1;
    const perPage = 100;
    while (true) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
      if (error) return json({ error: "Could not list registered users" }, 500);
      const authUsers = data.users;
      if (!authUsers.length) break;
      const ids = authUsers.map((user) => user.id);
      const { data: roles, error: usersRoleError } = await adminClient
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", ids);
      if (usersRoleError) return json({ error: "Could not load user roles" }, 500);
      const adminIds = new Set(
        (roles ?? []).filter((row) => row.role === "admin").map((row) => row.user_id),
      );
      users.push(
        ...authUsers.map((user) => ({
          id: user.id,
          email: user.email ?? "",
          created_at: user.created_at,
          role: (adminIds.has(user.id) ? "admin" : "user") as "admin" | "user",
        })),
      );
      if (authUsers.length < perPage) break;
      page += 1;
    }
    return json({ users });
  }

  if (
    !userId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
  ) {
    return json({ error: "A valid userId is required" }, 400);
  }
  if (!["promote", "demote", "delete"].includes(action ?? "")) {
    return json({ error: "Unsupported action" }, 400);
  }

  const { data: targetRoles, error: targetRoleError } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (targetRoleError) return json({ error: "Could not inspect target user role" }, 500);
  const targetIsAdmin = targetRoles?.some((row) => row.role === "admin") ?? false;

  if ((action === "demote" || action === "delete") && userId === caller.id) {
    return json({ error: "You cannot remove your own administrator account" }, 400);
  }

  if ((action === "demote" && targetIsAdmin) || (action === "delete" && targetIsAdmin)) {
    const { count, error: countError } = await adminClient
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "admin");
    if (countError) return json({ error: "Could not verify administrator count" }, 500);
    if ((count ?? 0) <= 1)
      return json({ error: "The last administrator cannot be demoted or deleted" }, 400);
  }

  if (action === "promote") {
    if (!targetIsAdmin) {
      const { error } = await adminClient
        .from("user_roles")
        .insert({ user_id: userId, role: "admin" });
      if (error) return json({ error: "Could not grant administrator role" }, 500);
    }
    return json({ ok: true, role: "admin" });
  }

  if (action === "demote") {
    const { error } = await adminClient
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "admin");
    if (error) return json({ error: "Could not remove administrator role" }, 500);
    return json({ ok: true, role: "user" });
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteError) return json({ error: "Could not delete user account" }, 500);
  return json({ ok: true });
});
