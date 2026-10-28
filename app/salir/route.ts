import { NextResponse } from 'next/server';
import { supabaseServidor } from '@/lib/supabase/server';

export async function POST(request: Request) {
  await supabaseServidor().auth.signOut();
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
