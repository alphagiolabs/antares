import { createClient } from "jsr:@supabase/supabase-js@2";

interface DeleteUserBody {
  user_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body: DeleteUserBody = await req.json();
    const targetUserId = body.user_id;

    if (!targetUserId) {
      return new Response(
        JSON.stringify({ error: "user_id es obligatorio" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "This endpoint requires a valid Bearer token" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    // Check caller is admin
    const { data: { user: callerUser } } = await userClient.auth.getUser();
    if (!callerUser) {
      return new Response(
        JSON.stringify({ error: "This endpoint requires a valid Bearer token" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const { data: profile } = await userClient
      .from("user_profiles")
      .select("is_admin")
      .eq("user_id", callerUser.id)
      .single();

    if (!profile?.is_admin) {
      return new Response(
        JSON.stringify({ error: "Solo los administradores pueden eliminar usuarios" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    // Prevent self-deletion
    if (targetUserId === callerUser.id) {
      return new Response(
        JSON.stringify({ error: "No puedes eliminar tu propia cuenta" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Delete user with service role key (Admin API)
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId);

    if (deleteError) {
      return new Response(
        JSON.stringify({ error: deleteError.message }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
