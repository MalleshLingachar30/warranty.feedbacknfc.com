type GenericRecord = Record<string, unknown>;

export const ACTIVATION_MODES = [
  "plug_and_play",
  "installation_driven",
] as const;
export type ActivationMode = (typeof ACTIVATION_MODES)[number];

export const INSTALLATION_OWNERSHIP_MODES = [
  "manufacturer_only",
  "dealer_allowed",
] as const;
export type InstallationOwnershipMode =
  (typeof INSTALLATION_OWNERSHIP_MODES)[number];

export const ACTIVATION_TRIGGERS = [
  "self_activation",
  "installation_report_submission",
] as const;
export type ActivationTrigger = (typeof ACTIVATION_TRIGGERS)[number];

export const CUSTOMER_CREATION_MODES = [
  "on_activation",
  "on_installation",
] as const;
export type CustomerCreationMode = (typeof CUSTOMER_CREATION_MODES)[number];

export const PART_TRACEABILITY_MODES = [
  "none",
  "pack_or_kit",
  "unit_scan_mandatory",
] as const;
export type PartTraceabilityMode = (typeof PART_TRACEABILITY_MODES)[number];

export const SMALL_PART_TRACKING_MODES = [
  "individual",
  "pack_level",
  "kit_level",
  "pack_or_kit",
] as const;
export type SmallPartTrackingMode = (typeof SMALL_PART_TRACKING_MODES)[number];

export type RequiredPhotoPolicy = {
  requireBeforePhoto: boolean;
  requireAfterPhoto: boolean;
  minimumPhotoCount: number;
};

export type ManufacturerPolicyDefaults = {
  defaultActivationMode: ActivationMode;
  defaultInstallationOwnershipMode: InstallationOwnershipMode;
  defaultActivationTrigger: ActivationTrigger;
  defaultCustomerCreationMode: CustomerCreationMode;
  defaultAllowCartonSaleRegistration: boolean;
  defaultAllowUnitSelfActivation: boolean;
  defaultPartTraceabilityMode: PartTraceabilityMode;
  defaultSmallPartTrackingMode: SmallPartTrackingMode;
  defaultAcknowledgementRequired: boolean;
  defaultRequiredGeoCapture: boolean;
  defaultChecklistTemplate: string[];
  defaultCommissioningTemplate: string[];
  defaultRequiredPhotoPolicy: RequiredPhotoPolicy;
  defaultInstallerSkillTags: string[];
  erpInboundEnabled: boolean;
  erpOutboundEnabled: boolean;
};

export type ProductModelPolicy = {
  activationMode: ActivationMode;
  installationOwnershipMode: InstallationOwnershipMode;
  installationRequired: boolean;
  activationTrigger: ActivationTrigger;
  customerCreationMode: CustomerCreationMode;
  allowCartonSaleRegistration: boolean;
  allowUnitSelfActivation: boolean;
  partTraceabilityMode: PartTraceabilityMode;
  smallPartTrackingMode: SmallPartTrackingMode;
  customerAcknowledgementRequired: boolean;
  installationChecklistTemplate: string[];
  commissioningTemplate: string[];
  requiredPhotoPolicy: RequiredPhotoPolicy;
  requiredGeoCapture: boolean;
  defaultInstallerSkillTags: string[];
  includedKitDefinition: Record<string, unknown>;
};

export const DEFAULT_REQUIRED_PHOTO_POLICY: RequiredPhotoPolicy = {
  requireBeforePhoto: false,
  requireAfterPhoto: false,
  minimumPhotoCount: 0,
};

export const DEFAULT_MANUFACTURER_POLICY_DEFAULTS: ManufacturerPolicyDefaults = {
  defaultActivationMode: "plug_and_play",
  defaultInstallationOwnershipMode: "manufacturer_only",
  defaultActivationTrigger: "self_activation",
  defaultCustomerCreationMode: "on_activation",
  defaultAllowCartonSaleRegistration: true,
  defaultAllowUnitSelfActivation: true,
  defaultPartTraceabilityMode: "none",
  defaultSmallPartTrackingMode: "individual",
  defaultAcknowledgementRequired: false,
  defaultRequiredGeoCapture: false,
  defaultChecklistTemplate: [],
  defaultCommissioningTemplate: [],
  defaultRequiredPhotoPolicy: DEFAULT_REQUIRED_PHOTO_POLICY,
  defaultInstallerSkillTags: [],
  erpInboundEnabled: true,
  erpOutboundEnabled: false,
};

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  return null;
}

function asPositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const normalized = Math.floor(value);
  if (normalized < 0) {
    return null;
  }

  return normalized;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();

  for (const entry of value) {
    const text = asString(entry);
    if (text) {
      unique.add(text);
    }
  }

  return [...unique];
}

function asObject(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return value;
}

function parseRequiredPhotoPolicy(value: unknown): RequiredPhotoPolicy {
  const source = asObject(value);

  return {
    requireBeforePhoto:
      asBoolean(source.requireBeforePhoto ?? source.require_before_photo) ??
      DEFAULT_REQUIRED_PHOTO_POLICY.requireBeforePhoto,
    requireAfterPhoto:
      asBoolean(source.requireAfterPhoto ?? source.require_after_photo) ??
      DEFAULT_REQUIRED_PHOTO_POLICY.requireAfterPhoto,
    minimumPhotoCount: Math.min(
      20,
      asPositiveInteger(
        source.minimumPhotoCount ?? source.minimum_photo_count,
      ) ?? DEFAULT_REQUIRED_PHOTO_POLICY.minimumPhotoCount,
    ),
  };
}

function parseEnum<T extends readonly string[]>(
  options: T,
  value: unknown,
  fallback: T[number],
): T[number] {
  const candidate = asString(value);
  if (candidate && (options as readonly string[]).includes(candidate)) {
    return candidate as T[number];
  }

  return fallback;
}

function enforceInstallationDrivenDefaults(
  policy: ProductModelPolicy,
): ProductModelPolicy {
  if (policy.activationMode !== "installation_driven") {
    return policy;
  }

  return {
    ...policy,
    installationRequired: true,
    allowUnitSelfActivation: false,
    activationTrigger: "installation_report_submission",
    customerCreationMode: "on_installation",
    customerAcknowledgementRequired: true,
  };
}

function normalizeInstallationModeDefaults(
  defaults: ManufacturerPolicyDefaults,
): ManufacturerPolicyDefaults {
  if (defaults.defaultActivationMode !== "installation_driven") {
    return defaults;
  }

  const nextPhotoPolicy: RequiredPhotoPolicy = {
    requireBeforePhoto: true,
    requireAfterPhoto: true,
    minimumPhotoCount: Math.max(defaults.defaultRequiredPhotoPolicy.minimumPhotoCount, 2),
  };

  return {
    ...defaults,
    defaultActivationTrigger: "installation_report_submission",
    defaultCustomerCreationMode: "on_installation",
    defaultAllowUnitSelfActivation: false,
    defaultAcknowledgementRequired: true,
    defaultPartTraceabilityMode:
      defaults.defaultPartTraceabilityMode === "none"
        ? "pack_or_kit"
        : defaults.defaultPartTraceabilityMode,
    defaultRequiredPhotoPolicy: nextPhotoPolicy,
  };
}

export function normalizeManufacturerPolicyDefaults(
  value: unknown,
): ManufacturerPolicyDefaults {
  const source = asObject(value);

  const normalized: ManufacturerPolicyDefaults = {
    defaultActivationMode: parseEnum(
      ACTIVATION_MODES,
      source.defaultActivationMode ?? source.default_activation_mode,
      DEFAULT_MANUFACTURER_POLICY_DEFAULTS.defaultActivationMode,
    ),
    defaultInstallationOwnershipMode: parseEnum(
      INSTALLATION_OWNERSHIP_MODES,
      source.defaultInstallationOwnershipMode ??
        source.default_installation_ownership_mode,
      DEFAULT_MANUFACTURER_POLICY_DEFAULTS.defaultInstallationOwnershipMode,
    ),
    defaultActivationTrigger: parseEnum(
      ACTIVATION_TRIGGERS,
      source.defaultActivationTrigger ?? source.default_activation_trigger,
      DEFAULT_MANUFACTURER_POLICY_DEFAULTS.defaultActivationTrigger,
    ),
    defaultCustomerCreationMode: parseEnum(
      CUSTOMER_CREATION_MODES,
      source.defaultCustomerCreationMode ?? source.default_customer_creation_mode,
      DEFAULT_MANUFACTURER_POLICY_DEFAULTS.defaultCustomerCreationMode,
    ),
    defaultAllowCartonSaleRegistration:
      asBoolean(
        source.defaultAllowCartonSaleRegistration ??
          source.default_allow_carton_sale_registration,
      ) ?? DEFAULT_MANUFACTURER_POLICY_DEFAULTS.defaultAllowCartonSaleRegistration,
    defaultAllowUnitSelfActivation:
      asBoolean(
        source.defaultAllowUnitSelfActivation ??
          source.default_allow_unit_self_activation,
      ) ?? DEFAULT_MANUFACTURER_POLICY_DEFAULTS.defaultAllowUnitSelfActivation,
    defaultPartTraceabilityMode: parseEnum(
      PART_TRACEABILITY_MODES,
      source.defaultPartTraceabilityMode ?? source.default_part_traceability_mode,
      DEFAULT_MANUFACTURER_POLICY_DEFAULTS.defaultPartTraceabilityMode,
    ),
    defaultSmallPartTrackingMode: parseEnum(
      SMALL_PART_TRACKING_MODES,
      source.defaultSmallPartTrackingMode ?? source.default_small_part_tracking_mode,
      DEFAULT_MANUFACTURER_POLICY_DEFAULTS.defaultSmallPartTrackingMode,
    ),
    defaultAcknowledgementRequired:
      asBoolean(
        source.defaultAcknowledgementRequired ??
          source.default_acknowledgement_required,
      ) ?? DEFAULT_MANUFACTURER_POLICY_DEFAULTS.defaultAcknowledgementRequired,
    defaultRequiredGeoCapture:
      asBoolean(
        source.defaultRequiredGeoCapture ?? source.default_required_geo_capture,
      ) ?? DEFAULT_MANUFACTURER_POLICY_DEFAULTS.defaultRequiredGeoCapture,
    defaultChecklistTemplate: parseStringArray(
      source.defaultChecklistTemplate ?? source.default_checklist_template,
    ),
    defaultCommissioningTemplate: parseStringArray(
      source.defaultCommissioningTemplate ?? source.default_commissioning_template,
    ),
    defaultRequiredPhotoPolicy: parseRequiredPhotoPolicy(
      source.defaultRequiredPhotoPolicy ?? source.default_required_photo_policy,
    ),
    defaultInstallerSkillTags: parseStringArray(
      source.defaultInstallerSkillTags ?? source.default_installer_skill_tags,
    ),
    erpInboundEnabled:
      asBoolean(source.erpInboundEnabled ?? source.erp_inbound_enabled) ??
      DEFAULT_MANUFACTURER_POLICY_DEFAULTS.erpInboundEnabled,
    erpOutboundEnabled:
      asBoolean(source.erpOutboundEnabled ?? source.erp_outbound_enabled) ??
      DEFAULT_MANUFACTURER_POLICY_DEFAULTS.erpOutboundEnabled,
  };

  return normalizeInstallationModeDefaults(normalized);
}

export function manufacturerPolicyDefaultsToSettingsPatch(
  defaults: ManufacturerPolicyDefaults,
): Record<string, unknown> {
  return {
    policyDefaults: {
      defaultActivationMode: defaults.defaultActivationMode,
      defaultInstallationOwnershipMode: defaults.defaultInstallationOwnershipMode,
      defaultActivationTrigger: defaults.defaultActivationTrigger,
      defaultCustomerCreationMode: defaults.defaultCustomerCreationMode,
      defaultAllowCartonSaleRegistration: defaults.defaultAllowCartonSaleRegistration,
      defaultAllowUnitSelfActivation: defaults.defaultAllowUnitSelfActivation,
      defaultPartTraceabilityMode: defaults.defaultPartTraceabilityMode,
      defaultSmallPartTrackingMode: defaults.defaultSmallPartTrackingMode,
      defaultAcknowledgementRequired: defaults.defaultAcknowledgementRequired,
      defaultRequiredGeoCapture: defaults.defaultRequiredGeoCapture,
      defaultChecklistTemplate: defaults.defaultChecklistTemplate,
      defaultCommissioningTemplate: defaults.defaultCommissioningTemplate,
      defaultRequiredPhotoPolicy: {
        requireBeforePhoto: defaults.defaultRequiredPhotoPolicy.requireBeforePhoto,
        requireAfterPhoto: defaults.defaultRequiredPhotoPolicy.requireAfterPhoto,
        minimumPhotoCount: defaults.defaultRequiredPhotoPolicy.minimumPhotoCount,
      },
      defaultInstallerSkillTags: defaults.defaultInstallerSkillTags,
      erpInboundEnabled: defaults.erpInboundEnabled,
      erpOutboundEnabled: defaults.erpOutboundEnabled,
    },
  };
}

export function buildDefaultProductModelPolicy(
  defaults: ManufacturerPolicyDefaults,
): ProductModelPolicy {
  const base: ProductModelPolicy = {
    activationMode: defaults.defaultActivationMode,
    installationOwnershipMode: defaults.defaultInstallationOwnershipMode,
    installationRequired: defaults.defaultActivationMode === "installation_driven",
    activationTrigger: defaults.defaultActivationTrigger,
    customerCreationMode: defaults.defaultCustomerCreationMode,
    allowCartonSaleRegistration: defaults.defaultAllowCartonSaleRegistration,
    allowUnitSelfActivation: defaults.defaultAllowUnitSelfActivation,
    partTraceabilityMode: defaults.defaultPartTraceabilityMode,
    smallPartTrackingMode: defaults.defaultSmallPartTrackingMode,
    customerAcknowledgementRequired: defaults.defaultAcknowledgementRequired,
    installationChecklistTemplate: defaults.defaultChecklistTemplate,
    commissioningTemplate: defaults.defaultCommissioningTemplate,
    requiredPhotoPolicy: defaults.defaultRequiredPhotoPolicy,
    requiredGeoCapture: defaults.defaultRequiredGeoCapture,
    defaultInstallerSkillTags: defaults.defaultInstallerSkillTags,
    includedKitDefinition: {},
  };

  return enforceInstallationDrivenDefaults(base);
}

export function normalizeIncludedKitDefinition(value: unknown) {
  return asObject(value);
}

export function normalizeProductModelPolicy(input: {
  payload: unknown;
  defaults: ManufacturerPolicyDefaults;
  existing?: ProductModelPolicy;
}) {
  const source = asObject(input.payload);
  const baseline = input.existing ?? buildDefaultProductModelPolicy(input.defaults);

  const normalized: ProductModelPolicy = {
    activationMode: parseEnum(
      ACTIVATION_MODES,
      source.activationMode ?? source.activation_mode,
      baseline.activationMode,
    ),
    installationOwnershipMode: parseEnum(
      INSTALLATION_OWNERSHIP_MODES,
      source.installationOwnershipMode ?? source.installation_ownership_mode,
      baseline.installationOwnershipMode,
    ),
    installationRequired:
      asBoolean(source.installationRequired ?? source.installation_required) ??
      baseline.installationRequired,
    activationTrigger: parseEnum(
      ACTIVATION_TRIGGERS,
      source.activationTrigger ?? source.activation_trigger,
      baseline.activationTrigger,
    ),
    customerCreationMode: parseEnum(
      CUSTOMER_CREATION_MODES,
      source.customerCreationMode ?? source.customer_creation_mode,
      baseline.customerCreationMode,
    ),
    allowCartonSaleRegistration:
      asBoolean(
        source.allowCartonSaleRegistration ?? source.allow_carton_sale_registration,
      ) ?? baseline.allowCartonSaleRegistration,
    allowUnitSelfActivation:
      asBoolean(source.allowUnitSelfActivation ?? source.allow_unit_self_activation) ??
      baseline.allowUnitSelfActivation,
    partTraceabilityMode: parseEnum(
      PART_TRACEABILITY_MODES,
      source.partTraceabilityMode ?? source.part_traceability_mode,
      baseline.partTraceabilityMode,
    ),
    smallPartTrackingMode: parseEnum(
      SMALL_PART_TRACKING_MODES,
      source.smallPartTrackingMode ?? source.small_part_tracking_mode,
      baseline.smallPartTrackingMode,
    ),
    customerAcknowledgementRequired:
      asBoolean(
        source.customerAcknowledgementRequired ??
          source.customer_acknowledgement_required,
      ) ?? baseline.customerAcknowledgementRequired,
    installationChecklistTemplate:
      source.installationChecklistTemplate !== undefined ||
      source.installation_checklist_template !== undefined
        ? parseStringArray(
            source.installationChecklistTemplate ??
              source.installation_checklist_template,
          )
        : baseline.installationChecklistTemplate,
    commissioningTemplate:
      source.commissioningTemplate !== undefined ||
      source.commissioning_template !== undefined
        ? parseStringArray(
            source.commissioningTemplate ?? source.commissioning_template,
          )
        : baseline.commissioningTemplate,
    requiredPhotoPolicy:
      source.requiredPhotoPolicy !== undefined ||
      source.required_photo_policy !== undefined
        ? parseRequiredPhotoPolicy(
            source.requiredPhotoPolicy ?? source.required_photo_policy,
          )
        : baseline.requiredPhotoPolicy,
    requiredGeoCapture:
      asBoolean(source.requiredGeoCapture ?? source.required_geo_capture) ??
      baseline.requiredGeoCapture,
    defaultInstallerSkillTags:
      source.defaultInstallerSkillTags !== undefined ||
      source.default_installer_skill_tags !== undefined
        ? parseStringArray(
            source.defaultInstallerSkillTags ?? source.default_installer_skill_tags,
          )
        : baseline.defaultInstallerSkillTags,
    includedKitDefinition:
      source.includedKitDefinition !== undefined ||
      source.included_kit_definition !== undefined
        ? normalizeIncludedKitDefinition(
            source.includedKitDefinition ?? source.included_kit_definition,
          )
        : baseline.includedKitDefinition,
  };

  const policy = enforceInstallationDrivenDefaults(normalized);
  const errors: string[] = [];

  if (policy.activationMode === "installation_driven") {
    if (policy.installationChecklistTemplate.length === 0) {
      errors.push(
        "Installation-driven models must include at least one checklist step.",
      );
    }

    if (policy.partTraceabilityMode === "none") {
      errors.push(
        "Installation-driven models must define a non-'none' part traceability mode.",
      );
    }

    if (
      !policy.requiredPhotoPolicy.requireBeforePhoto ||
      !policy.requiredPhotoPolicy.requireAfterPhoto ||
      policy.requiredPhotoPolicy.minimumPhotoCount < 2
    ) {
      errors.push(
        "Installation-driven models must require before/after photos with minimum photo count of at least 2.",
      );
    }
  }

  return {
    policy,
    errors,
  };
}
