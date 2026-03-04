import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"

const REQUIRED_ROLE = "manufacturer_admin"

type GenericRecord = Record<string, unknown>

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object"
}

function normalizeRole(role: string) {
  return role.replace(/^org:/, "").toLowerCase()
}

function pushRole(roles: Set<string>, value: unknown) {
  if (typeof value === "string" && value.trim().length > 0) {
    roles.add(value)
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim().length > 0) {
        roles.add(item)
      }
    }
  }
}

function extractRolesFromClaims(claims: unknown) {
  const roles = new Set<string>()

  if (!isRecord(claims)) {
    return roles
  }

  pushRole(roles, claims.role)
  pushRole(roles, claims.roles)

  const metadata = claims.metadata
  if (isRecord(metadata)) {
    pushRole(roles, metadata.role)
    pushRole(roles, metadata.roles)
  }

  const publicMetadata = claims.public_metadata
  if (isRecord(publicMetadata)) {
    pushRole(roles, publicMetadata.role)
    pushRole(roles, publicMetadata.roles)
  }

  return roles
}

export async function ensureManufacturerAdmin() {
  const authData = await auth()

  if (!authData.userId) {
    authData.redirectToSignIn()
  }

  // Optional escape hatch for local UI work before auth claims are wired.
  if (process.env.NEXT_PUBLIC_DISABLE_ROLE_GUARD === "true") {
    return authData
  }

  const allRoles = new Set<string>()
  pushRole(allRoles, authData.orgRole)

  const claimRoles = extractRolesFromClaims(authData.sessionClaims)
  for (const role of claimRoles) {
    allRoles.add(role)
  }

  const hasRequiredRole = [...allRoles].some(
    (role) => normalizeRole(role) === REQUIRED_ROLE
  )

  if (!hasRequiredRole) {
    redirect("/dashboard?access=denied&required=manufacturer_admin")
  }

  return authData
}
