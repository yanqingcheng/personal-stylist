import { paid } from '@/lib/style/server/paid';
export const maxDuration=300;
export async function POST(request:Request) { return paid(request,'generation'); }
