import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const REQUERIDAS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_PROJECT_REF'];

function pagina(titulo: string, detalle: string) {
  return new NextResponse(
    `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title><body style="font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#1b2430">
<h1 style="font-size:22px">${titulo}</h1><p style="line-height:1.6">${detalle}</p></body></html>`,
    { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
}

export async function middleware(request: NextRequest) {
  // Las variables NEXT_PUBLIC_ se incrustan al compilar: si se agregan después, hay que volver a desplegar.
  const valores: Record<string, string | undefined> = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_PROJECT_REF: process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF,
  };
  const faltan = REQUERIDAS.filter((k) => !valores[k]);
  if (faltan.length) {
    return pagina('Configuración incompleta',
      `Faltan estas variables de entorno en Vercel: <b>${faltan.join(', ')}</b>.<br>Agréguelas en Settings → Environment Variables (Production y Preview) y vuelva a desplegar con «Redeploy».`);
  }
  let host = '';
  try { host = new URL(valores.NEXT_PUBLIC_SUPABASE_URL!).hostname; } catch { /* se informa abajo */ }
  if (host !== `${valores.NEXT_PUBLIC_SUPABASE_PROJECT_REF}.supabase.co`) {
    return pagina('Proyecto de Supabase no coincide',
      'NEXT_PUBLIC_SUPABASE_URL debe ser https://&lt;referencia&gt;.supabase.co con la misma referencia de NEXT_PUBLIC_SUPABASE_PROJECT_REF. Corrija las variables y vuelva a desplegar.');
  }

  let response = NextResponse.next({ request });
  try {
    const supabase = createServerClient(valores.NEXT_PUBLIC_SUPABASE_URL!, valores.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(lista: { name: string; value: string; options?: any }[]) {
          lista.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          lista.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const { data: { user } } = await supabase.auth.getUser();
    const publica = request.nextUrl.pathname.startsWith('/login');
    if (!user && !publica) {
      const destino = request.nextUrl.clone();
      destino.pathname = '/login';
      destino.search = '';
      return NextResponse.redirect(destino);
    }
    return response;
  } catch (e) {
    console.error('middleware', e instanceof Error ? e.message : e);
    return pagina('No se pudo validar la sesión', 'El servidor de autenticación no respondió. Intente de nuevo en unos segundos.');
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logos/|fonts/|manifest.webmanifest|sw.js).*)'],
};
