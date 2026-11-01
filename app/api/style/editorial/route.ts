import { editorial } from '@/lib/style/server/schema';
import { unavailable } from '@/lib/style/server/unavailable';
export async function POST(request:Request) { return unavailable(request,editorial); }
