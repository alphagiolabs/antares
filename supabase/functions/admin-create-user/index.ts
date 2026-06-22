import { createClient } from "jsr:@supabase/supabase-js@2";

const ADMIN_EMAIL = "admin@antares.cl";

interface CreateUserBody {
  email?: string;
  password?: string;
  email_confirm?: boolean;
  display_name?: string;
  role?: "user" | "admin";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body: CreateUserBody = await req.json();
    const email = body.email?.trim().toLowerCase();
    const password = body.password;

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Email y password son obligatorios" }),
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
        JSON.stringify({ error: "Solo los administradores pueden crear usuarios" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    // Create user with service role key (Admin API)
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: body.email_confirm ?? true,
    });

    if (createError) {
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // If admin role requested, set it via RPC
    if (body.role === "admin" && userData.user?.id) {
      const { error: adminError } = await adminClient.rpc("admin_set_admin", {
        p_user_id: userData.user.id,
        p_is_admin: true,
      });
      if (adminError) {
        return new Response(
          JSON.stringify({ error: adminError.message, user: userData.user }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    return new Response(
      JSON.stringify({ user: userData.user }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
