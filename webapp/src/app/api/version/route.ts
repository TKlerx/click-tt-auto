import { NextResponse } from "next/server";
import { getAppVersionInfo } from "@/lib/app-version";

export function GET() {
  return NextResponse.json(getAppVersionInfo());
}
