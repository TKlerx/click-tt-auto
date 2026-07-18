import { NextResponse } from "next/server";
import { requireRasterInputSet } from "@/lib/raster/route-context";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await requireRasterInputSet(
    request,
    (await params).id,
    "scheduler",
  );
  if ("error" in context) return context.error;

  return NextResponse.json({
    prompt:
      'Extract Terminwuensche as JSON. If the PDF is scanned or text extraction is poor, use OCR first and then return only this shape: {"wishes":[{"clubId":"...","clubName":"...","teamLabel":"...","homeWeekday":"FRIDAY","hall":"1","startTime":"19:30","spielwochePref":"A","requestedRasterzahl":7,"notes":"..."}]}',
    submitTo: `/api/raster/input-sets/${context.inputSet.id}/wishes/json`,
    weekdays: [
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
      "SUNDAY",
    ],
  });
}
