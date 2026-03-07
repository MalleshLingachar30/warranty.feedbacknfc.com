"use client";

import { useMemo, useState } from "react";
import { Building2, Link2, ShieldPlus, Wrench } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AdminMember = {
  id: string;
  name: string;
  email: string;
  clerkId: string;
  role:
    | "super_admin"
    | "manufacturer_admin"
    | "service_center_admin"
    | "technician"
    | "customer";
};

type OrganizationRow = {
  id: string;
  name: string;
  type: "manufacturer" | "distributor" | "service_center" | "retailer";
  slug: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  pincode: string | null;
  subscriptionTier: string;
  subscriptionExpiresAt: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
  adminMembers: AdminMember[];
  linkedManufacturerIds: string[];
  linkedManufacturerNames: string[];
  serviceCenterBranches: Array<{
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    address: string | null;
    pincode: string | null;
    phone: string | null;
    email: string | null;
    supportedCategories: string[];
  }>;
};

type SuperAdminOrganizationsClientProps = {
  initialOrganizations: OrganizationRow[];
};

type ManufacturerFormState = {
  name: string;
  city: string;
  state: string;
  country: string;
  address: string;
  pincode: string;
  contactEmail: string;
  contactPhone: string;
  adminName: string;
  adminEmail: string;
  adminClerkId: string;
};

type ServiceCenterFormState = {
  organizationName: string;
  centerName: string;
  city: string;
  state: string;
  country: string;
  address: string;
  pincode: string;
  contactEmail: string;
  contactPhone: string;
  supportedCategories: string;
  manufacturerOrganizationId: string;
  adminName: string;
  adminEmail: string;
  adminClerkId: string;
};

type AssignAdminFormState = {
  organizationId: string;
  adminRole: "manufacturer_admin" | "service_center_admin";
  adminName: string;
  adminEmail: string;
  adminClerkId: string;
};

const defaultManufacturerForm = (): ManufacturerFormState => ({
  name: "",
  city: "",
  state: "",
  country: "IN",
  address: "",
  pincode: "",
  contactEmail: "",
  contactPhone: "",
  adminName: "",
  adminEmail: "",
  adminClerkId: "",
});

const defaultServiceCenterForm = (): ServiceCenterFormState => ({
  organizationName: "",
  centerName: "",
  city: "",
  state: "",
  country: "IN",
  address: "",
  pincode: "",
  contactEmail: "",
  contactPhone: "",
  supportedCategories: "",
  manufacturerOrganizationId: "",
  adminName: "",
  adminEmail: "",
  adminClerkId: "",
});

const defaultAssignAdminForm = (): AssignAdminFormState => ({
  organizationId: "",
  adminRole: "manufacturer_admin",
  adminName: "",
  adminEmail: "",
  adminClerkId: "",
});

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN");
}

function formatOrgType(value: OrganizationRow["type"]) {
  return value.replace(/_/g, " ");
}

function normalizeCommaList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function SuperAdminOrganizationsClient({
  initialOrganizations,
}: SuperAdminOrganizationsClientProps) {
  const [organizations, setOrganizations] =
    useState<OrganizationRow[]>(initialOrganizations);
  const [manufacturerForm, setManufacturerForm] = useState(
    defaultManufacturerForm(),
  );
  const [serviceCenterForm, setServiceCenterForm] = useState(
    defaultServiceCenterForm(),
  );
  const [assignAdminForm, setAssignAdminForm] = useState(
    defaultAssignAdminForm(),
  );
  const [isSubmittingManufacturer, setIsSubmittingManufacturer] =
    useState(false);
  const [isSubmittingServiceCenter, setIsSubmittingServiceCenter] =
    useState(false);
  const [isAssigningAdmin, setIsAssigningAdmin] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<
    string | null
  >(null);

  const manufacturerOrganizations = useMemo(
    () => organizations.filter((org) => org.type === "manufacturer"),
    [organizations],
  );

  const assignableOrganizations = useMemo(
    () =>
      organizations.filter(
        (org) => org.type === "manufacturer" || org.type === "service_center",
      ),
    [organizations],
  );

  const selectedAssignOrganization = useMemo(
    () =>
      organizations.find((org) => org.id === assignAdminForm.organizationId) ??
      null,
    [assignAdminForm.organizationId, organizations],
  );
  const selectedOrganization = useMemo(
    () =>
      organizations.find((org) => org.id === selectedOrganizationId) ?? null,
    [organizations, selectedOrganizationId],
  );
  const selectedAdmin = selectedOrganization?.adminMembers[0] ?? null;
  const selectedBranch = selectedOrganization?.serviceCenterBranches[0] ?? null;

  const submitAction = async (payload: unknown) => {
    const response = await fetch("/api/super-admin/onboarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = (await response.json()) as {
      error?: string;
      organizations?: OrganizationRow[];
    };

    if (!response.ok || !json.organizations) {
      throw new Error(json.error ?? "Unable to complete onboarding action.");
    }

    setOrganizations(json.organizations);
  };

  const createManufacturer = async () => {
    if (!manufacturerForm.name.trim()) {
      setActionError("Manufacturer name is required.");
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setIsSubmittingManufacturer(true);

    try {
      await submitAction({
        action: "create_manufacturer",
        organization: {
          name: manufacturerForm.name,
          city: manufacturerForm.city,
          state: manufacturerForm.state,
          country: manufacturerForm.country,
          address: manufacturerForm.address,
          pincode: manufacturerForm.pincode,
          contactEmail: manufacturerForm.contactEmail,
          contactPhone: manufacturerForm.contactPhone,
        },
        admin: {
          name: manufacturerForm.adminName,
          email: manufacturerForm.adminEmail,
          clerkId: manufacturerForm.adminClerkId,
        },
      });

      setManufacturerForm(defaultManufacturerForm());
      setActionSuccess("Manufacturer organization created successfully.");
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to create manufacturer.",
      );
    } finally {
      setIsSubmittingManufacturer(false);
    }
  };

  const createServiceCenter = async () => {
    if (!serviceCenterForm.organizationName.trim()) {
      setActionError("Service-center organization name is required.");
      return;
    }

    if (!serviceCenterForm.centerName.trim()) {
      setActionError("Service-center branch name is required.");
      return;
    }

    if (!serviceCenterForm.city.trim()) {
      setActionError("Service-center city is required.");
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setIsSubmittingServiceCenter(true);

    try {
      await submitAction({
        action: "create_service_center",
        organization: {
          name: serviceCenterForm.organizationName,
          city: serviceCenterForm.city,
          state: serviceCenterForm.state,
          country: serviceCenterForm.country,
          address: serviceCenterForm.address,
          pincode: serviceCenterForm.pincode,
          contactEmail: serviceCenterForm.contactEmail,
          contactPhone: serviceCenterForm.contactPhone,
        },
        center: {
          name: serviceCenterForm.centerName,
          city: serviceCenterForm.city,
          state: serviceCenterForm.state,
          address: serviceCenterForm.address,
          pincode: serviceCenterForm.pincode,
          phone: serviceCenterForm.contactPhone,
          email: serviceCenterForm.contactEmail,
          supportedCategories: normalizeCommaList(
            serviceCenterForm.supportedCategories,
          ),
          manufacturerOrganizationIds:
            serviceCenterForm.manufacturerOrganizationId
              ? [serviceCenterForm.manufacturerOrganizationId]
              : [],
        },
        admin: {
          name: serviceCenterForm.adminName,
          email: serviceCenterForm.adminEmail,
          clerkId: serviceCenterForm.adminClerkId,
        },
      });

      setServiceCenterForm(defaultServiceCenterForm());
      setActionSuccess("Service-center organization created successfully.");
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to create service center.",
      );
    } finally {
      setIsSubmittingServiceCenter(false);
    }
  };

  const assignAdmin = async () => {
    if (!assignAdminForm.organizationId) {
      setActionError("Select an organization first.");
      return;
    }

    if (
      !assignAdminForm.adminClerkId.trim() &&
      !assignAdminForm.adminEmail.trim()
    ) {
      setActionError("Provide Clerk user ID or an existing user email.");
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setIsAssigningAdmin(true);

    try {
      await submitAction({
        action: "assign_admin",
        organizationId: assignAdminForm.organizationId,
        adminRole: assignAdminForm.adminRole,
        admin: {
          name: assignAdminForm.adminName,
          email: assignAdminForm.adminEmail,
          clerkId: assignAdminForm.adminClerkId,
        },
      });

      setAssignAdminForm(defaultAssignAdminForm());
      setActionSuccess("Admin assigned successfully.");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to assign admin.",
      );
    } finally {
      setIsAssigningAdmin(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organizations"
        description="Onboard manufacturers, service centers, and admin owners for your warranty network."
      />

      {selectedOrganization ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900">
                Selected organization snapshot
              </p>
              <p className="text-sm text-slate-600">
                Read-only view for {selectedOrganization.name}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedOrganizationId(null)}
            >
              Clear selection
            </Button>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="size-4" />
                  Manufacturer View
                </CardTitle>
                <CardDescription>
                  Organization profile details shown as a read-only snapshot.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  value={
                    selectedOrganization.type === "manufacturer"
                      ? selectedOrganization.name
                      : ""
                  }
                  disabled
                  placeholder="Manufacturer name"
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    value={
                      selectedOrganization.type === "manufacturer"
                        ? (selectedOrganization.city ?? "")
                        : ""
                    }
                    disabled
                    placeholder="City"
                  />
                  <Input
                    value={
                      selectedOrganization.type === "manufacturer"
                        ? (selectedOrganization.state ?? "")
                        : ""
                    }
                    disabled
                    placeholder="State"
                  />
                </div>
                <Input
                  value={
                    selectedOrganization.type === "manufacturer"
                      ? (selectedOrganization.contactEmail ?? "")
                      : ""
                  }
                  disabled
                  placeholder="Contact email"
                />
                <Input
                  value={
                    selectedOrganization.type === "manufacturer"
                      ? (selectedOrganization.contactPhone ?? "")
                      : ""
                  }
                  disabled
                  placeholder="Contact phone"
                />
                <div className="rounded-md border bg-slate-50 p-3 text-sm">
                  <p className="mb-2 font-medium">First admin</p>
                  <div className="space-y-2">
                    <Input
                      value={
                        selectedOrganization.type === "manufacturer"
                          ? (selectedAdmin?.name ?? "")
                          : ""
                      }
                      disabled
                      placeholder="Admin name"
                    />
                    <Input
                      value={
                        selectedOrganization.type === "manufacturer"
                          ? (selectedAdmin?.email ?? "")
                          : ""
                      }
                      disabled
                      placeholder="Existing user email"
                    />
                    <Input
                      value={
                        selectedOrganization.type === "manufacturer"
                          ? (selectedAdmin?.clerkId ?? "")
                          : ""
                      }
                      disabled
                      placeholder="Clerk user ID"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wrench className="size-4" />
                  Service Center View
                </CardTitle>
                <CardDescription>
                  Branch and manufacturer-link details for a selected service
                  center.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  value={
                    selectedOrganization.type === "service_center"
                      ? selectedOrganization.name
                      : ""
                  }
                  disabled
                  placeholder="Service-center organization name"
                />
                <Input
                  value={
                    selectedOrganization.type === "service_center"
                      ? (selectedBranch?.name ?? "")
                      : ""
                  }
                  disabled
                  placeholder="Branch / center name"
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    value={
                      selectedOrganization.type === "service_center"
                        ? (selectedBranch?.city ??
                          selectedOrganization.city ??
                          "")
                        : ""
                    }
                    disabled
                    placeholder="City"
                  />
                  <Input
                    value={
                      selectedOrganization.type === "service_center"
                        ? (selectedBranch?.state ??
                          selectedOrganization.state ??
                          "")
                        : ""
                    }
                    disabled
                    placeholder="State"
                  />
                </div>
                <Input
                  value={
                    selectedOrganization.type === "service_center"
                      ? (selectedBranch?.email ??
                        selectedOrganization.contactEmail ??
                        "")
                      : ""
                  }
                  disabled
                  placeholder="Contact email"
                />
                <Input
                  value={
                    selectedOrganization.type === "service_center"
                      ? (selectedBranch?.phone ??
                        selectedOrganization.contactPhone ??
                        "")
                      : ""
                  }
                  disabled
                  placeholder="Contact phone"
                />
                <Input
                  value={
                    selectedOrganization.type === "service_center"
                      ? selectedBranch?.supportedCategories.join(", ")
                      : ""
                  }
                  disabled
                  placeholder="Supported categories"
                />
                <Input
                  value={
                    selectedOrganization.type === "service_center"
                      ? selectedOrganization.linkedManufacturerNames.join(", ")
                      : ""
                  }
                  disabled
                  placeholder="Linked manufacturer"
                />
                <div className="rounded-md border bg-slate-50 p-3 text-sm">
                  <p className="mb-2 font-medium">First admin</p>
                  <div className="space-y-2">
                    <Input
                      value={
                        selectedOrganization.type === "service_center"
                          ? (selectedAdmin?.name ?? "")
                          : ""
                      }
                      disabled
                      placeholder="Admin name"
                    />
                    <Input
                      value={
                        selectedOrganization.type === "service_center"
                          ? (selectedAdmin?.email ?? "")
                          : ""
                      }
                      disabled
                      placeholder="Existing user email"
                    />
                    <Input
                      value={
                        selectedOrganization.type === "service_center"
                          ? (selectedAdmin?.clerkId ?? "")
                          : ""
                      }
                      disabled
                      placeholder="Clerk user ID"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldPlus className="size-4" />
                  Admin Assignment View
                </CardTitle>
                <CardDescription>
                  Role and owner details for the selected organization.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  value={selectedOrganization.name}
                  disabled
                  placeholder="Selected organization"
                />
                <Input
                  value={
                    selectedOrganization.type === "service_center"
                      ? "service_center_admin"
                      : "manufacturer_admin"
                  }
                  disabled
                  placeholder="Admin role"
                />
                <Input
                  value={selectedAdmin?.name ?? ""}
                  disabled
                  placeholder="Admin name"
                />
                <Input
                  value={selectedAdmin?.email ?? ""}
                  disabled
                  placeholder="Existing user email"
                />
                <Input
                  value={selectedAdmin?.clerkId ?? ""}
                  disabled
                  placeholder="Clerk user ID"
                />
                {selectedOrganization.adminMembers.length > 1 ? (
                  <div className="rounded-md border bg-slate-50 p-3 text-sm">
                    <p className="mb-2 font-medium">Additional admins</p>
                    <div className="space-y-1">
                      {selectedOrganization.adminMembers
                        .slice(1)
                        .map((admin) => (
                          <p key={admin.id} className="text-slate-700">
                            {admin.name || admin.email || admin.clerkId}
                          </p>
                        ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="size-4" />
              Create Manufacturer
            </CardTitle>
            <CardDescription>
              Create a manufacturer organization and optionally assign the first
              manufacturer admin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={manufacturerForm.name}
              onChange={(event) =>
                setManufacturerForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Manufacturer name"
            />
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                value={manufacturerForm.city}
                onChange={(event) =>
                  setManufacturerForm((current) => ({
                    ...current,
                    city: event.target.value,
                  }))
                }
                placeholder="City"
              />
              <Input
                value={manufacturerForm.state}
                onChange={(event) =>
                  setManufacturerForm((current) => ({
                    ...current,
                    state: event.target.value,
                  }))
                }
                placeholder="State"
              />
            </div>
            <Input
              value={manufacturerForm.contactEmail}
              onChange={(event) =>
                setManufacturerForm((current) => ({
                  ...current,
                  contactEmail: event.target.value,
                }))
              }
              placeholder="Contact email"
            />
            <Input
              value={manufacturerForm.contactPhone}
              onChange={(event) =>
                setManufacturerForm((current) => ({
                  ...current,
                  contactPhone: event.target.value,
                }))
              }
              placeholder="Contact phone"
            />
            <div className="rounded-md border bg-slate-50 p-3 text-sm">
              <p className="mb-2 font-medium">Optional first admin</p>
              <div className="space-y-2">
                <Input
                  value={manufacturerForm.adminName}
                  onChange={(event) =>
                    setManufacturerForm((current) => ({
                      ...current,
                      adminName: event.target.value,
                    }))
                  }
                  placeholder="Admin name"
                />
                <Input
                  value={manufacturerForm.adminEmail}
                  onChange={(event) =>
                    setManufacturerForm((current) => ({
                      ...current,
                      adminEmail: event.target.value,
                    }))
                  }
                  placeholder="Existing user email"
                />
                <Input
                  value={manufacturerForm.adminClerkId}
                  onChange={(event) =>
                    setManufacturerForm((current) => ({
                      ...current,
                      adminClerkId: event.target.value,
                    }))
                  }
                  placeholder="Clerk user ID"
                />
              </div>
            </div>
            <Button
              onClick={() => void createManufacturer()}
              disabled={isSubmittingManufacturer}
              className="w-full"
            >
              {isSubmittingManufacturer ? "Creating..." : "Create Manufacturer"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="size-4" />
              Create Service Center
            </CardTitle>
            <CardDescription>
              Create a service-center organization, branch, and optionally link
              it to a manufacturer and first admin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={serviceCenterForm.organizationName}
              onChange={(event) =>
                setServiceCenterForm((current) => ({
                  ...current,
                  organizationName: event.target.value,
                }))
              }
              placeholder="Service-center organization name"
            />
            <Input
              value={serviceCenterForm.centerName}
              onChange={(event) =>
                setServiceCenterForm((current) => ({
                  ...current,
                  centerName: event.target.value,
                }))
              }
              placeholder="Branch / center name"
            />
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                value={serviceCenterForm.city}
                onChange={(event) =>
                  setServiceCenterForm((current) => ({
                    ...current,
                    city: event.target.value,
                  }))
                }
                placeholder="City"
              />
              <Input
                value={serviceCenterForm.state}
                onChange={(event) =>
                  setServiceCenterForm((current) => ({
                    ...current,
                    state: event.target.value,
                  }))
                }
                placeholder="State"
              />
            </div>
            <Input
              value={serviceCenterForm.contactEmail}
              onChange={(event) =>
                setServiceCenterForm((current) => ({
                  ...current,
                  contactEmail: event.target.value,
                }))
              }
              placeholder="Contact email"
            />
            <Input
              value={serviceCenterForm.contactPhone}
              onChange={(event) =>
                setServiceCenterForm((current) => ({
                  ...current,
                  contactPhone: event.target.value,
                }))
              }
              placeholder="Contact phone"
            />
            <Input
              value={serviceCenterForm.supportedCategories}
              onChange={(event) =>
                setServiceCenterForm((current) => ({
                  ...current,
                  supportedCategories: event.target.value,
                }))
              }
              placeholder="Supported categories (comma separated)"
            />
            <select
              value={serviceCenterForm.manufacturerOrganizationId}
              onChange={(event) =>
                setServiceCenterForm((current) => ({
                  ...current,
                  manufacturerOrganizationId: event.target.value,
                }))
              }
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Link manufacturer later</option>
              {manufacturerOrganizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
            <div className="rounded-md border bg-slate-50 p-3 text-sm">
              <p className="mb-2 font-medium">Optional first admin</p>
              <div className="space-y-2">
                <Input
                  value={serviceCenterForm.adminName}
                  onChange={(event) =>
                    setServiceCenterForm((current) => ({
                      ...current,
                      adminName: event.target.value,
                    }))
                  }
                  placeholder="Admin name"
                />
                <Input
                  value={serviceCenterForm.adminEmail}
                  onChange={(event) =>
                    setServiceCenterForm((current) => ({
                      ...current,
                      adminEmail: event.target.value,
                    }))
                  }
                  placeholder="Existing user email"
                />
                <Input
                  value={serviceCenterForm.adminClerkId}
                  onChange={(event) =>
                    setServiceCenterForm((current) => ({
                      ...current,
                      adminClerkId: event.target.value,
                    }))
                  }
                  placeholder="Clerk user ID"
                />
              </div>
            </div>
            <Button
              onClick={() => void createServiceCenter()}
              disabled={isSubmittingServiceCenter}
              className="w-full"
            >
              {isSubmittingServiceCenter
                ? "Creating..."
                : "Create Service Center"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldPlus className="size-4" />
              Assign Admin
            </CardTitle>
            <CardDescription>
              Attach an existing user to a manufacturer or service-center
              organization as its first admin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              value={assignAdminForm.organizationId}
              onChange={(event) => {
                const nextOrganization = organizations.find(
                  (org) => org.id === event.target.value,
                );
                setAssignAdminForm((current) => ({
                  ...current,
                  organizationId: event.target.value,
                  adminRole:
                    nextOrganization?.type === "service_center"
                      ? "service_center_admin"
                      : "manufacturer_admin",
                }));
              }}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select organization</option>
              {assignableOrganizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name} ({formatOrgType(organization.type)})
                </option>
              ))}
            </select>
            <Input
              value={assignAdminForm.adminName}
              onChange={(event) =>
                setAssignAdminForm((current) => ({
                  ...current,
                  adminName: event.target.value,
                }))
              }
              placeholder="Admin name"
            />
            <Input
              value={assignAdminForm.adminEmail}
              onChange={(event) =>
                setAssignAdminForm((current) => ({
                  ...current,
                  adminEmail: event.target.value,
                }))
              }
              placeholder="Existing user email"
            />
            <Input
              value={assignAdminForm.adminClerkId}
              onChange={(event) =>
                setAssignAdminForm((current) => ({
                  ...current,
                  adminClerkId: event.target.value,
                }))
              }
              placeholder="Clerk user ID"
            />
            {selectedAssignOrganization ? (
              <p className="text-xs text-muted-foreground">
                Role to assign:{" "}
                <span className="font-medium">{assignAdminForm.adminRole}</span>
              </p>
            ) : null}
            <Button
              onClick={() => void assignAdmin()}
              disabled={isAssigningAdmin}
              className="w-full"
            >
              {isAssigningAdmin ? "Assigning..." : "Assign Admin"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {actionError ? (
        <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {actionError}
        </p>
      ) : null}

      {actionSuccess ? (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {actionSuccess}
        </p>
      ) : null}

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Organizations</CardTitle>
          <CardDescription>
            Manufacturers and service centers currently onboarded in the system.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {organizations.length === 0 ? (
            <p className="text-sm text-slate-600">No organizations found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Admins</TableHead>
                    <TableHead>Linked Manufacturers</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {organizations.map((org) => (
                    <TableRow
                      key={org.id}
                      className={
                        selectedOrganizationId === org.id
                          ? "bg-indigo-50/70"
                          : "cursor-pointer"
                      }
                      onClick={() => setSelectedOrganizationId(org.id)}
                    >
                      <TableCell className="min-w-[240px]">
                        <p className="font-medium text-slate-900">{org.name}</p>
                        <p className="text-xs text-slate-500">
                          {org.slug ? org.slug : org.id.slice(0, 8)}
                          {org.city ? ` • ${org.city}` : ""}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className="border-slate-200 bg-slate-50"
                        >
                          {formatOrgType(org.type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-[220px]">
                        {org.adminMembers.length > 0 ? (
                          <div className="space-y-1">
                            {org.adminMembers.map((admin) => (
                              <div key={admin.id}>
                                <p className="text-sm font-medium text-slate-900">
                                  {admin.name || admin.email || admin.clerkId}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {admin.email || admin.clerkId}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-500">
                            No admin assigned
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-[220px]">
                        {org.linkedManufacturerNames.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {org.linkedManufacturerNames.map((name) => (
                              <Badge key={name} variant="secondary">
                                <Link2 className="mr-1 size-3" />
                                {name}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-500">—</span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-[220px] text-sm text-slate-600">
                        <p>{org.contactPhone ?? "—"}</p>
                        <p className="text-xs text-slate-500">
                          {org.contactEmail ?? "—"}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-slate-600">
                        {formatDate(org.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
