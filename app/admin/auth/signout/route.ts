import { NextRequest } from 'next/server';
import { signOutAndRedirect } from '@/lib/auth/signout-response';

export async function POST(request: NextRequest) {
  return signOutAndRedirect(request);
}
