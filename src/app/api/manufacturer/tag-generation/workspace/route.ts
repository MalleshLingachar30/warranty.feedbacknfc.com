import { NextResponse } from "next/server";

import { getTagGenerationWorkspaceData } from "@/lib/manufacturer/tag-generation-workspace";

import { jsonError, requireManufacturerContext } from "../../_utils";

export async function GET() {
  try {
    const { organizationId } = await requireManufacturerContext();
    const workspace = await getTagGenerationWorkspaceData(organizationId);

    return NextResponse.json(workspace);
  } catch (error) {
    return jsonError(error);
  }
}
