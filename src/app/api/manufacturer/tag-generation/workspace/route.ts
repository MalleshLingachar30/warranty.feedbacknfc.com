import { NextResponse } from "next/server";

import { getTagGenerationWorkspaceData } from "@/lib/manufacturer/tag-generation-workspace";

import { jsonError, requireManufacturerWorkspaceContext } from "../../_utils";

export async function GET() {
  try {
    const { organizationId } = await requireManufacturerWorkspaceContext();
    const workspace = await getTagGenerationWorkspaceData(organizationId);

    return NextResponse.json(workspace);
  } catch (error) {
    return jsonError(error);
  }
}
