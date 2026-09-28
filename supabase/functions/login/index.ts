// Proxy login: klien nggak lagi manggil supabase.auth.signInWithPassword() langsung,
// soalnya itu nggak bisa "dicegat" buat dibatasi jumlah percobaannya. Fungsi ini yang
// cek riwayat gagal dulu (kunci 15 menit setelah 5x gagal beruntun), baru neruskan ke
// Supabase Auth kalau belum kena kunci, dan balikin token sesi ke klien buat di-set
// lewat supabase.auth.setSession(...).
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const { identifier, password } = await req.json();
    if (!identifier || !password) {
      return jsonResponse({ error: "Email/No HP dan password wajib diisi." }, 400);
    }

    const key = String(identifier).trim().toLowerCase();
    const admin = getSupabaseAdmin();

    // Beresin jejak lama biar tabel nggak numpuk terus buat identifier ini.
    await admin.from("login_attempts").delete().eq("identifier", key).lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();
    const { data: recentFails } = await admin
      .from("login_attempts")
      .select("created_at")
      .eq("identifier", key)
      .eq("success", false)
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(MAX_ATTEMPTS);

    if ((recentFails ?? []).length >= MAX_ATTEMPTS) {
      const oldestOfBatch = recentFails![MAX_ATTEMPTS - 1].created_at;
      const unlockAt = new Date(oldestOfBatch).getTime() + WINDOW_MS;
      const remainingMs = unlockAt - Date.now();
      if (remainingMs > 0) {
        const remainingMin = Math.max(1, Math.ceil(remainingMs / 60000));
        return jsonResponse(
          { error: `Terlalu banyak percobaan login gagal. Akun ini dikunci sementara, coba lagi dalam ${remainingMin} menit ya.` },
          429
        );
      }
    }

    let email: string | null = null;
    if (isEmail(identifier)) {
      email = identifier;
    } else {
      const { data: profile } = await admin.from("profiles").select("email").eq("phone", identifier).maybeSingle();
      email = profile?.email ?? null;
    }

    if (!email) {
      await admin.from("login_attempts").insert({ identifier: key, success: false });
      return jsonResponse({ error: "Email/No HP atau password salah." }, 401);
    }

    const authRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
      body: JSON.stringify({ email, password }),
    });
    const authData = await authRes.json();

    if (!authRes.ok || !authData.access_token) {
      await admin.from("login_attempts").insert({ identifier: key, success: false });
      return jsonResponse({ error: "Email/No HP atau password salah." }, 401);
    }

    await admin.from("login_attempts").insert({ identifier: key, success: true });
    return jsonResponse({ ok: true, access_token: authData.access_token, refresh_token: authData.refresh_token });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
