import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { sessionHasRole } from "@/lib/org-context"

const REQUIRED_ROLE = "manufacturer_admin"

export async function ensureManufacturerAdmin() {
  const authData = await auth()

  if (!authData.userId) {
    authData.redirectToSignIn()
  }

  // Optional escape hatch for local UI work before auth claims are wired.
  if (process.env.NEXT_PUBLIC_DISABLE_ROLE_GUARD === "true") {
    return authData
  }

  const hasRequiredRole = sessionHasRole({
    orgRole: authData.orgRole,
    sessionClaims: authData.sessionClaims,
    requiredRole: REQUIRED_ROLE,
  })

  if (!hasRequiredRole) {
    redirect("/dashboard?access=denied&required=manufacturer_admin")
  }

  return authData
}
