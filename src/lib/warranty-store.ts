import "server-only";

import type {
  ServiceHistoryItem,
  TechnicianJobsResponse,
  TechnicianPerformanceSummary,
  WarrantyCompleteTicketInput,
  WarrantyCreateTicketInput,
  WarrantyProduct,
  WarrantyProductModel,
  WarrantySticker,
  WarrantyTechnician,
  WarrantyTicket,
  WarrantyTicketPartUsed,
  WarrantyTicketStatus,
} from "@/lib/warranty-types";
import {
  sendCustomerCompletionPrompt,
  sendCustomerEnRouteNotification,
  sendCustomerWorkStartedNotification,
  sendTechnicianAssignmentSms,
} from "@/lib/warranty-notifications";

const OPEN_STATUSES: WarrantyTicketStatus[] = [
  "reported",
  "assigned",
  "technician_enroute",
  "work_in_progress",
  "pending_confirmation",
  "reopened",
  "escalated",
];

interface WarrantyStore {
  stickers: WarrantySticker[];
  products: WarrantyProduct[];
  productModels: WarrantyProductModel[];
  technicians: WarrantyTechnician[];
  tickets: WarrantyTicket[];
  ticketSequence: number;
}

function toIso(date: Date) {
  return date.toISOString();
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function monthsFromNow(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date;
}

function sanitizePhone(phone: string) {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) {
    return `+${trimmed.slice(1).replace(/\D/g, "")}`;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+91${digits}`;
  }

  if (digits.length > 10 && !digits.startsWith("91")) {
    return `+${digits}`;
  }

  if (digits.length > 0) {
    return `+${digits}`;
  }

  return "";
}

function makeTimelineEvent(
  ticketId: string,
  eventType: string,
  eventDescription: string,
  actorName: string,
  actorRole: string,
  createdAt = new Date()
) {
  return {
    id: `${ticketId}-${eventType}-${Math.random().toString(16).slice(2, 8)}`,
    eventType,
    eventDescription,
    actorName,
    actorRole,
    createdAt: toIso(createdAt),
  };
}

function parseTicketSequence(ticketNumber: string) {
  const match = ticketNumber.match(/(\d{6})$/);
  if (!match) {
    return 0;
  }

  return Number.parseInt(match[1] ?? "0", 10);
}

function generateTicketNumber(sequence: number) {
  const year = new Date().getFullYear();
  return `WRT-${year}-${String(sequence).padStart(6, "0")}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createSeedStore(): WarrantyStore {
  const productModels: WarrantyProductModel[] = [
    {
      id: "model-aquapure-x7",
      organizationId: "org-aquasure",
      name: "AquaPure RO X7",
      category: "water_purifier",
      modelNumber: "AP-X7-2026",
      imageUrl:
        "https://images.unsplash.com/photo-1581093588401-12a4b2e6f6f7?auto=format&fit=crop&w=1200&q=80",
      warrantyDurationMonths: 24,
      partTraceabilityMode: "pack_or_kit",
      smallPartTrackingMode: "pack_or_kit",
      commonIssues: [
        "Low water flow",
        "Water leakage",
        "Filter warning light",
        "No power",
        "Unusual noise",
      ],
      requiredSkills: ["water_purifier", "electrical"],
      partsCatalog: [
        {
          id: "part-ro-filter",
          name: "RO Membrane Filter",
          partNumber: "RO-MEM-110",
          typicalCost: 1650,
        },
        {
          id: "part-smps-board",
          name: "SMPS Power Board",
          partNumber: "SMPS-220A",
          typicalCost: 1250,
        },
        {
          id: "part-pump-head",
          name: "Booster Pump Head",
          partNumber: "PMP-54X",
          typicalCost: 980,
        },
      ],
    },
    {
      id: "model-coolair-pro",
      organizationId: "org-aquasure",
      name: "CoolAir Split AC Pro",
      category: "ac",
      modelNumber: "CA-18P",
      imageUrl:
        "https://images.unsplash.com/photo-1630591240929-1f652f8f16f4?auto=format&fit=crop&w=1200&q=80",
      warrantyDurationMonths: 18,
      partTraceabilityMode: "none",
      smallPartTrackingMode: "individual",
      commonIssues: ["Not cooling", "Gas leakage", "Compressor noise", "Remote not working"],
      requiredSkills: ["ac", "electrical"],
      partsCatalog: [
        {
          id: "part-capacitor",
          name: "Start Capacitor",
          partNumber: "CAP-45UF",
          typicalCost: 450,
        },
        {
          id: "part-fan-motor",
          name: "Condenser Fan Motor",
          partNumber: "FAN-CM-77",
          typicalCost: 1550,
        },
      ],
    },
  ];

  const stickers: WarrantySticker[] = [
    {
      id: "st-120045",
      stickerNumber: 120045,
      stickerSerial: "FNFC-120045",
      status: "activated",
      organizationName: "AquaSure Appliances",
      productId: "prod-water-001",
    },
    {
      id: "st-120046",
      stickerNumber: 120046,
      stickerSerial: "FNFC-120046",
      status: "activated",
      organizationName: "AquaSure Appliances",
      productId: "prod-ac-001",
    },
    {
      id: "st-120047",
      stickerNumber: 120047,
      stickerSerial: "FNFC-120047",
      status: "activated",
      organizationName: "AquaSure Appliances",
      productId: "prod-ac-002",
    },
    {
      id: "st-120048",
      stickerNumber: 120048,
      stickerSerial: "FNFC-120048",
      status: "bound",
      organizationName: "AquaSure Appliances",
      productId: null,
    },
    {
      id: "st-120049",
      stickerNumber: 120049,
      stickerSerial: "FNFC-120049",
      status: "unregistered",
      organizationName: null,
      productId: null,
    },
  ];

  const products: WarrantyProduct[] = [
    {
      id: "prod-water-001",
      stickerId: "st-120045",
      stickerNumber: 120045,
      organizationId: "org-aquasure",
      organizationName: "AquaSure Appliances",
      productModelId: "model-aquapure-x7",
      serialNumber: "AQX7-SN-29011",
      warrantyStatus: "active",
      warrantyStartDate: toIso(daysAgo(212)),
      warrantyEndDate: toIso(monthsFromNow(17)),
      installationDate: toIso(daysAgo(206)),
      customerId: null,
      customerName: "Priya Rao",
      customerPhone: "+919845001122",
      customerEmail: "priya.rao@example.com",
      customerAddress: "21 MG Road, Ashok Nagar, Bengaluru",
      customerCity: "Bengaluru",
      customerState: "Karnataka",
      customerPincode: "560001",
    },
    {
      id: "prod-ac-001",
      stickerId: "st-120046",
      stickerNumber: 120046,
      organizationId: "org-aquasure",
      organizationName: "AquaSure Appliances",
      productModelId: "model-coolair-pro",
      serialNumber: "CAP-SN-88212",
      warrantyStatus: "active",
      warrantyStartDate: toIso(daysAgo(120)),
      warrantyEndDate: toIso(monthsFromNow(12)),
      installationDate: toIso(daysAgo(118)),
      customerId: null,
      customerName: "Rohan Sharma",
      customerPhone: "+919999002341",
      customerEmail: "rohan.sharma@example.com",
      customerAddress: "140 Residency Road, Richmond Town, Bengaluru",
      customerCity: "Bengaluru",
      customerState: "Karnataka",
      customerPincode: "560025",
    },
    {
      id: "prod-ac-002",
      stickerId: "st-120047",
      stickerNumber: 120047,
      organizationId: "org-aquasure",
      organizationName: "AquaSure Appliances",
      productModelId: "model-coolair-pro",
      serialNumber: "CAP-SN-99228",
      warrantyStatus: "active",
      warrantyStartDate: toIso(daysAgo(90)),
      warrantyEndDate: toIso(monthsFromNow(15)),
      installationDate: toIso(daysAgo(88)),
      customerId: null,
      customerName: "Neha Menon",
      customerPhone: "+919880667788",
      customerEmail: "neha.menon@example.com",
      customerAddress: "18 Lavelle Road, Bengaluru",
      customerCity: "Bengaluru",
      customerState: "Karnataka",
      customerPincode: "560001",
    },
  ];

  const technicians: WarrantyTechnician[] = [
    {
      id: "tech-bharat-001",
      name: "Bharat Kumar",
      phone: "+919845551234",
      serviceCenterId: "svc-bengaluru-01",
      serviceCenterName: "FixFast Service Hub",
      coverageCities: ["Bengaluru", "Mysuru"],
      skills: ["water_purifier", "electrical", "ac"],
      rating: 4.7,
      activeJobCount: 2,
      isAvailable: true,
      distanceByCityKm: {
        Bengaluru: 8,
        Mysuru: 22,
      },
    },
    {
      id: "tech-anita-002",
      name: "Anita Joseph",
      phone: "+919902223344",
      serviceCenterId: "svc-bengaluru-01",
      serviceCenterName: "FixFast Service Hub",
      coverageCities: ["Bengaluru"],
      skills: ["water_purifier", "electrical"],
      rating: 4.9,
      activeJobCount: 1,
      isAvailable: true,
      distanceByCityKm: {
        Bengaluru: 12,
      },
    },
    {
      id: "tech-vikram-003",
      name: "Vikram Iyer",
      phone: "+919840001111",
      serviceCenterId: "svc-bengaluru-02",
      serviceCenterName: "Prime Cooling Services",
      coverageCities: ["Bengaluru", "Tumakuru"],
      skills: ["ac", "electrical"],
      rating: 4.4,
      activeJobCount: 3,
      isAvailable: false,
      distanceByCityKm: {
        Bengaluru: 5,
      },
    },
  ];

  const completedTicketDate = daysAgo(9);
  const completedStart = new Date(completedTicketDate.getTime() + 60 * 60 * 1000);
  const completedEnd = new Date(completedStart.getTime() + 2.25 * 60 * 60 * 1000);

  const tickets: WarrantyTicket[] = [
    {
      id: "ticket-1001",
      ticketNumber: "WRT-2026-000201",
      productId: "prod-ac-001",
      stickerId: "st-120046",
      reportedByName: "Rohan Sharma",
      reportedByPhone: "+919999002341",
      issueCategory: "Not cooling",
      issueDescription: "Indoor unit runs but room is not cooling after 10 minutes.",
      severity: "high",
      status: "assigned",
      reportedAt: toIso(hoursAgo(3.5)),
      assignedTechnicianId: "tech-bharat-001",
      assignedTechnicianName: "Bharat Kumar",
      assignedTechnicianPhone: "+919845551234",
      etaLabel: "35 mins",
      customerPhotos: [],
      resolutionNotes: null,
      resolutionPhotos: [],
      partsUsed: [],
      laborHours: null,
      aiSuggestedParts: [
        {
          id: "part-capacitor",
          name: "Start Capacitor",
          partNumber: "CAP-45UF",
          typicalCost: 450,
        },
      ],
      claimValue: 0,
      technicianStartedAt: null,
      technicianCompletedAt: null,
      customerRating: null,
      timeline: [
        makeTimelineEvent(
          "ticket-1001",
          "created",
          "Service request created by customer.",
          "Rohan Sharma",
          "customer",
          hoursAgo(3.5)
        ),
        makeTimelineEvent(
          "ticket-1001",
          "assigned",
          "AI assigned technician Bharat Kumar.",
          "AI Assignment Engine",
          "system",
          hoursAgo(3.4)
        ),
      ],
    },
    {
      id: "ticket-1002",
      ticketNumber: "WRT-2026-000202",
      productId: "prod-ac-002",
      stickerId: "st-120047",
      reportedByName: "Neha Menon",
      reportedByPhone: "+919880667788",
      issueCategory: "Compressor noise",
      issueDescription:
        "Loud vibration sound from outdoor unit, especially when compressor starts.",
      severity: "medium",
      status: "work_in_progress",
      reportedAt: toIso(hoursAgo(18)),
      assignedTechnicianId: "tech-bharat-001",
      assignedTechnicianName: "Bharat Kumar",
      assignedTechnicianPhone: "+919845551234",
      etaLabel: "On-site",
      customerPhotos: [],
      resolutionNotes: null,
      resolutionPhotos: [],
      partsUsed: [],
      laborHours: null,
      aiSuggestedParts: [
        {
          id: "part-fan-motor",
          name: "Condenser Fan Motor",
          partNumber: "FAN-CM-77",
          typicalCost: 1550,
        },
      ],
      claimValue: 0,
      technicianStartedAt: toIso(hoursAgo(2.5)),
      technicianCompletedAt: null,
      customerRating: null,
      timeline: [
        makeTimelineEvent(
          "ticket-1002",
          "created",
          "Service request created by customer.",
          "Neha Menon",
          "customer",
          hoursAgo(18)
        ),
        makeTimelineEvent(
          "ticket-1002",
          "assigned",
          "AI assigned technician Bharat Kumar.",
          "AI Assignment Engine",
          "system",
          hoursAgo(17.5)
        ),
        makeTimelineEvent(
          "ticket-1002",
          "technician_started",
          "Technician started work at customer location.",
          "Bharat Kumar",
          "technician",
          hoursAgo(2.5)
        ),
      ],
    },
    {
      id: "ticket-0999",
      ticketNumber: "WRT-2026-000198",
      productId: "prod-ac-001",
      stickerId: "st-120046",
      reportedByName: "Rohan Sharma",
      reportedByPhone: "+919999002341",
      issueCategory: "Remote not working",
      issueDescription: "Remote display blank intermittently.",
      severity: "low",
      status: "completed",
      reportedAt: toIso(completedTicketDate),
      assignedTechnicianId: "tech-bharat-001",
      assignedTechnicianName: "Bharat Kumar",
      assignedTechnicianPhone: "+919845551234",
      etaLabel: "Completed",
      customerPhotos: [],
      resolutionNotes: "Remote receiver board reseated and remote batteries replaced.",
      resolutionPhotos: [],
      partsUsed: [
        {
          partName: "AAA Battery Pair",
          partNumber: "BAT-AAA-2",
          cost: 120,
        },
      ],
      laborHours: 2.25,
      aiSuggestedParts: [],
      claimValue: 1582.5,
      technicianStartedAt: toIso(completedStart),
      technicianCompletedAt: toIso(completedEnd),
      customerRating: 4.8,
      timeline: [
        makeTimelineEvent(
          "ticket-0999",
          "created",
          "Service request created by customer.",
          "Rohan Sharma",
          "customer",
          completedTicketDate
        ),
        makeTimelineEvent(
          "ticket-0999",
          "assigned",
          "AI assigned technician Bharat Kumar.",
          "AI Assignment Engine",
          "system",
          new Date(completedTicketDate.getTime() + 12 * 60 * 1000)
        ),
        makeTimelineEvent(
          "ticket-0999",
          "completed",
          "Work completed and customer confirmed.",
          "Bharat Kumar",
          "technician",
          completedEnd
        ),
      ],
    },
  ];

  const ticketSequence = tickets.reduce(
    (max, ticket) => Math.max(max, parseTicketSequence(ticket.ticketNumber)),
    0
  );

  return {
    stickers,
    products,
    productModels,
    technicians,
    tickets,
    ticketSequence,
  };
}

declare global {
  var __warrantyStore: WarrantyStore | undefined;
}

function getStore() {
  if (!globalThis.__warrantyStore) {
    globalThis.__warrantyStore = createSeedStore();
  }

  return globalThis.__warrantyStore;
}

function requireProduct(productId: string) {
  const product = getStore().products.find((entry) => entry.id === productId);
  if (!product) {
    throw new Error("Product not found");
  }
  return product;
}

function requireProductModel(productModelId: string) {
  const model = getStore().productModels.find((entry) => entry.id === productModelId);
  if (!model) {
    throw new Error("Product model not found");
  }
  return model;
}

function requireTicket(ticketId: string) {
  const ticket = getStore().tickets.find((entry) => entry.id === ticketId);
  if (!ticket) {
    throw new Error("Ticket not found");
  }
  return ticket;
}

function requireTechnician(technicianId: string) {
  const technician = getStore().technicians.find((entry) => entry.id === technicianId);
  if (!technician) {
    throw new Error("Technician not found");
  }
  return technician;
}

function findStickerByNumber(stickerNumber: number) {
  return getStore().stickers.find((entry) => entry.stickerNumber === stickerNumber) ?? null;
}

export function getStickerLookup(stickerNumber: number) {
  const store = getStore();
  const sticker = store.stickers.find((entry) => entry.stickerNumber === stickerNumber) ?? null;

  if (!sticker) {
    return {
      sticker: null,
      product: null,
      productModel: null,
      openTicket: null,
      serviceHistory: [] as ServiceHistoryItem[],
    };
  }

  const product = sticker.productId
    ? store.products.find((entry) => entry.id === sticker.productId) ?? null
    : null;

  const productModel = product
    ? store.productModels.find((entry) => entry.id === product.productModelId) ?? null
    : null;

  const productTickets = product
    ? store.tickets
        .filter((ticket) => ticket.productId === product.id)
        .sort((a, b) => +new Date(b.reportedAt) - +new Date(a.reportedAt))
    : [];

  const openTicket =
    productTickets.find((ticket) => OPEN_STATUSES.includes(ticket.status)) ?? null;

  const serviceHistory = productTickets.map<ServiceHistoryItem>((ticket) => ({
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    issueCategory: ticket.issueCategory,
    status: ticket.status,
    reportedAt: ticket.reportedAt,
    resolutionNotes: ticket.resolutionNotes,
  }));

  return {
    sticker: clone(sticker),
    product: product ? clone(product) : null,
    productModel: productModel ? clone(productModel) : null,
    openTicket: openTicket ? clone(openTicket) : null,
    serviceHistory,
  };
}

function calculateSkillMatch(technicianSkills: string[], requiredSkills: string[]) {
  if (requiredSkills.length === 0) {
    return 1;
  }

  const hits = requiredSkills.filter((skill) => technicianSkills.includes(skill)).length;
  return hits / requiredSkills.length;
}

function scoreTechnicianForTicket(
  technician: WarrantyTechnician,
  product: WarrantyProduct,
  model: WarrantyProductModel
) {
  const distanceKm = technician.distanceByCityKm[product.customerCity] ?? 80;
  const distanceScore = Math.max(0, 1 - distanceKm / 50);
  const ratingScore = Math.min(technician.rating / 5, 1);
  const workloadScore = Math.max(0, 1 - technician.activeJobCount / 3);
  const skillMatchScore = calculateSkillMatch(technician.skills, model.requiredSkills);

  const score =
    distanceScore * 0.4 + ratingScore * 0.25 + workloadScore * 0.2 + skillMatchScore * 0.15;

  return {
    technician,
    score,
    distanceKm,
  };
}

function findBestTechnician(product: WarrantyProduct, model: WarrantyProductModel) {
  const store = getStore();

  const candidates = store.technicians
    .filter((technician) => technician.isAvailable)
    .filter((technician) => technician.activeJobCount < 3)
    .filter((technician) => technician.coverageCities.includes(product.customerCity))
    .filter((technician) => calculateSkillMatch(technician.skills, model.requiredSkills) > 0)
    .map((technician) => scoreTechnicianForTicket(technician, product, model))
    .filter((entry) => entry.distanceKm <= 50)
    .sort((a, b) => b.score - a.score);

  return candidates[0] ?? null;
}

function appendTimeline(
  ticket: WarrantyTicket,
  eventType: string,
  eventDescription: string,
  actorName: string,
  actorRole: string
) {
  ticket.timeline.push(
    makeTimelineEvent(ticket.id, eventType, eventDescription, actorName, actorRole, new Date())
  );
}

function sanitizeParts(parts: WarrantyTicketPartUsed[]) {
  return parts
    .slice(0, 10)
    .map((part) => ({
      partName: part.partName.trim(),
      partNumber: part.partNumber.trim(),
      cost: Number.isFinite(part.cost) ? Math.max(0, part.cost) : 0,
    }))
    .filter((part) => part.partName.length > 0);
}

function sanitizePhotos(photos: string[], limit: number) {
  return photos
    .filter((entry) => typeof entry === "string" && entry.length > 0)
    .slice(0, limit);
}

function assignTicket(ticket: WarrantyTicket, product: WarrantyProduct, model: WarrantyProductModel) {
  const store = getStore();
  const bestMatch = findBestTechnician(product, model);

  if (!bestMatch) {
    appendTimeline(
      ticket,
      "assignment_escalated",
      "No technician matched skill and distance criteria. Escalated for manual assignment.",
      "AI Assignment Engine",
      "system"
    );
    return null;
  }

  ticket.status = "assigned";
  ticket.assignedTechnicianId = bestMatch.technician.id;
  ticket.assignedTechnicianName = bestMatch.technician.name;
  ticket.assignedTechnicianPhone = bestMatch.technician.phone;
  ticket.etaLabel = `${Math.max(20, Math.round(bestMatch.distanceKm * 2 + 12))} mins`;
  ticket.aiSuggestedParts = model.partsCatalog.slice(0, 2);

  bestMatch.technician.activeJobCount += 1;

  appendTimeline(
    ticket,
    "assigned",
    `AI assigned ${bestMatch.technician.name} from ${bestMatch.technician.serviceCenterName}.`,
    "AI Assignment Engine",
    "system"
  );

  void sendTechnicianAssignmentSms({
    technicianName: bestMatch.technician.name,
    technicianPhone: bestMatch.technician.phone,
    issueCategory: ticket.issueCategory,
    location: product.customerCity,
    productName: model.name,
    ticketNumber: ticket.ticketNumber,
  });

  store.tickets = store.tickets.map((entry) => (entry.id === ticket.id ? ticket : entry));
  return bestMatch;
}

function calculateResolutionHours(ticket: WarrantyTicket) {
  if (!ticket.technicianStartedAt || !ticket.technicianCompletedAt) {
    return null;
  }

  const startedAt = +new Date(ticket.technicianStartedAt);
  const completedAt = +new Date(ticket.technicianCompletedAt);

  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || completedAt <= startedAt) {
    return null;
  }

  return (completedAt - startedAt) / (60 * 60 * 1000);
}

function buildServiceHistory(productId: string) {
  return getStore()
    .tickets.filter((ticket) => ticket.productId === productId)
    .sort((a, b) => +new Date(b.reportedAt) - +new Date(a.reportedAt))
    .map<ServiceHistoryItem>((ticket) => ({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      issueCategory: ticket.issueCategory,
      status: ticket.status,
      reportedAt: ticket.reportedAt,
      resolutionNotes: ticket.resolutionNotes,
    }));
}

function calculatePerformance(technicianId: string): TechnicianPerformanceSummary {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const completedLike = getStore().tickets.filter(
    (ticket) =>
      ticket.assignedTechnicianId === technicianId &&
      (ticket.status === "pending_confirmation" || ticket.status === "completed") &&
      Boolean(ticket.technicianCompletedAt)
  );

  const weekly = completedLike.filter((ticket) => {
    if (!ticket.technicianCompletedAt) {
      return false;
    }
    return +new Date(ticket.technicianCompletedAt) >= +weekStart;
  });

  const monthly = completedLike.filter((ticket) => {
    if (!ticket.technicianCompletedAt) {
      return false;
    }
    return +new Date(ticket.technicianCompletedAt) >= +monthStart;
  });

  const resolutionDurations = completedLike
    .map(calculateResolutionHours)
    .filter((value): value is number => typeof value === "number");

  const ratings = completedLike
    .map((ticket) => ticket.customerRating)
    .filter((value): value is number => typeof value === "number");

  const totalClaimsValueGenerated = completedLike.reduce((sum, ticket) => sum + ticket.claimValue, 0);

  return {
    jobsCompletedThisWeek: weekly.length,
    jobsCompletedThisMonth: monthly.length,
    averageResolutionTimeHours:
      resolutionDurations.length > 0
        ? Number((resolutionDurations.reduce((sum, value) => sum + value, 0) / resolutionDurations.length).toFixed(1))
        : 0,
    customerRating:
      ratings.length > 0
        ? Number((ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1))
        : 0,
    totalClaimsValueGenerated: Number(totalClaimsValueGenerated.toFixed(2)),
  };
}

export async function createTicket(input: WarrantyCreateTicketInput) {
  const store = getStore();
  const product = requireProduct(input.productId);
  const model = requireProductModel(product.productModelId);

  store.ticketSequence += 1;
  const ticketNumber = generateTicketNumber(store.ticketSequence);
  const ticketId = `ticket-${store.ticketSequence}`;

  const now = new Date();
  const ticket: WarrantyTicket = {
    id: ticketId,
    ticketNumber,
    productId: product.id,
    stickerId: product.stickerId,
    reportedByName: input.customerName?.trim() || product.customerName || "Customer",
    reportedByPhone: sanitizePhone(input.customerPhone),
    issueCategory: input.issueCategory.trim(),
    issueDescription: input.issueDescription.trim(),
    severity: input.severity,
    status: "reported",
    reportedAt: toIso(now),
    assignedTechnicianId: null,
    assignedTechnicianName: null,
    assignedTechnicianPhone: null,
    etaLabel: null,
    customerPhotos: sanitizePhotos(input.photos, 5),
    resolutionNotes: null,
    resolutionPhotos: [],
    partsUsed: [],
    laborHours: null,
    aiSuggestedParts: [],
    claimValue: 0,
    technicianStartedAt: null,
    technicianCompletedAt: null,
    customerRating: null,
    timeline: [
      makeTimelineEvent(
        ticketId,
        "created",
        "Service request reported by customer.",
        input.customerName?.trim() || product.customerName || "Customer",
        "customer",
        now
      ),
    ],
  };

  store.tickets.push(ticket);

  assignTicket(ticket, product, model);

  return clone(ticket);
}

export function resolveProductIdForSticker(stickerNumber: number) {
  const sticker = findStickerByNumber(stickerNumber);
  if (!sticker?.productId) {
    return null;
  }
  return sticker.productId;
}

export function listTechnicianJobs(technicianId: string): TechnicianJobsResponse {
  const store = getStore();
  const technician = requireTechnician(technicianId);

  const jobs = store.tickets
    .filter((ticket) => ticket.assignedTechnicianId === technician.id)
    .sort((a, b) => +new Date(b.reportedAt) - +new Date(a.reportedAt))
    .map((ticket) => {
      const product = requireProduct(ticket.productId);
      const model = requireProductModel(product.productModelId);
      const serviceHistory = buildServiceHistory(product.id);

      return {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        severity: ticket.severity,
        issueCategory: ticket.issueCategory,
        issueDescription: ticket.issueDescription,
        reportedAt: ticket.reportedAt,
        customerName: product.customerName,
        customerPhone: product.customerPhone,
        customerAddress: product.customerAddress,
        customerCity: product.customerCity,
        productName: model.name,
        productModelNumber: model.modelNumber,
        productSerialNumber: product.serialNumber,
        customerPhotos: clone(ticket.customerPhotos),
        resolutionPhotos: clone(ticket.resolutionPhotos),
        resolutionNotes: ticket.resolutionNotes,
        partsUsed: clone(ticket.partsUsed),
        partsCatalog: clone(model.partsCatalog),
        aiSuggestedParts: clone(ticket.aiSuggestedParts),
        serviceHistory,
        technicianStartedAt: ticket.technicianStartedAt,
        technicianCompletedAt: ticket.technicianCompletedAt,
        laborHours: ticket.laborHours,
        claimValue: ticket.claimValue,
      };
    });

  return {
    technician: {
      id: technician.id,
      name: technician.name,
      phone: technician.phone,
      serviceCenterName: technician.serviceCenterName,
    },
    jobs,
    performance: calculatePerformance(technician.id),
    generatedAt: toIso(new Date()),
  };
}

export async function markTicketEnroute(ticketId: string, technicianId: string) {
  const ticket = requireTicket(ticketId);
  const technician = requireTechnician(technicianId);

  if (ticket.assignedTechnicianId !== technician.id) {
    throw new Error("Ticket is not assigned to this technician");
  }

  if (ticket.status !== "assigned") {
    if (ticket.status === "technician_enroute") {
      return clone(ticket);
    }
    throw new Error("Ticket is not in assigned state");
  }

  ticket.status = "technician_enroute";
  ticket.etaLabel = "Technician on the way";
  appendTimeline(
    ticket,
    "technician_enroute",
    `${technician.name} accepted the job and started navigation.`,
    technician.name,
    "technician"
  );

  const product = requireProduct(ticket.productId);
  void sendCustomerEnRouteNotification({
    customerPhone: product.customerPhone,
    customerName: product.customerName,
    technicianName: technician.name,
    technicianPhone: technician.phone,
    ticketNumber: ticket.ticketNumber,
  });

  return clone(ticket);
}

export async function markTicketStarted(ticketId: string, technicianId: string) {
  const ticket = requireTicket(ticketId);
  const technician = requireTechnician(technicianId);

  if (ticket.assignedTechnicianId !== technician.id) {
    throw new Error("Ticket is not assigned to this technician");
  }

  if (ticket.status !== "assigned" && ticket.status !== "technician_enroute") {
    if (ticket.status === "work_in_progress") {
      return clone(ticket);
    }
    throw new Error("Ticket cannot be started in current status");
  }

  const startedAt = new Date();
  ticket.status = "work_in_progress";
  ticket.technicianStartedAt = toIso(startedAt);
  ticket.etaLabel = "On-site";

  appendTimeline(
    ticket,
    "technician_started",
    `${technician.name} started service work.`,
    technician.name,
    "technician"
  );

  const product = requireProduct(ticket.productId);
  void sendCustomerWorkStartedNotification({
    customerPhone: product.customerPhone,
    customerName: product.customerName,
    ticketNumber: ticket.ticketNumber,
  });

  return clone(ticket);
}

export async function completeTicket(
  ticketId: string,
  technicianId: string,
  input: WarrantyCompleteTicketInput
) {
  const ticket = requireTicket(ticketId);
  const technician = requireTechnician(technicianId);

  if (ticket.assignedTechnicianId !== technician.id) {
    throw new Error("Ticket is not assigned to this technician");
  }

  if (ticket.status !== "work_in_progress") {
    if (ticket.status === "pending_confirmation") {
      return clone(ticket);
    }
    throw new Error("Ticket cannot be completed in current status");
  }

  const partsUsed = sanitizeParts(input.partsUsed);
  const laborHours = Number.isFinite(input.laborHours) ? Math.max(0, input.laborHours) : 0;
  const beforePhotos = sanitizePhotos(input.beforePhotos, 5);
  const afterPhotos = sanitizePhotos(input.afterPhotos, 5);

  const partsTotal = partsUsed.reduce((sum, part) => sum + part.cost, 0);
  const laborRatePerHour = 650;
  const claimValue = partsTotal + laborHours * laborRatePerHour;

  const completedAt = new Date();

  ticket.status = "pending_confirmation";
  ticket.resolutionNotes = input.resolutionNotes.trim();
  ticket.partsUsed = partsUsed;
  ticket.laborHours = laborHours;
  ticket.resolutionPhotos = [...beforePhotos, ...afterPhotos];
  ticket.claimValue = Number(claimValue.toFixed(2));
  ticket.technicianCompletedAt = toIso(completedAt);
  ticket.etaLabel = "Waiting for customer confirmation";

  appendTimeline(
    ticket,
    "technician_completed",
    `${technician.name} marked work complete and requested customer confirmation.`,
    technician.name,
    "technician"
  );

  technician.activeJobCount = Math.max(0, technician.activeJobCount - 1);

  const product = requireProduct(ticket.productId);
  void sendCustomerCompletionPrompt({
    customerPhone: product.customerPhone,
    customerName: product.customerName,
    ticketNumber: ticket.ticketNumber,
    stickerNumber: product.stickerNumber,
  });

  return clone(ticket);
}

interface ActivateWarrantyInput {
  productId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  customerAddress?: string | null;
  installationDate?: string;
}

function addMonths(input: Date, months: number) {
  const output = new Date(input);
  output.setMonth(output.getMonth() + months);
  return output;
}

export function activateWarranty(input: ActivateWarrantyInput) {
  const product = requireProduct(input.productId);
  const model = requireProductModel(product.productModelId);
  const sticker = getStore().stickers.find((entry) => entry.id === product.stickerId);

  if (!sticker) {
    throw new Error("Sticker linked to product was not found");
  }

  if (product.warrantyStatus !== "pending_activation" && product.warrantyStatus !== "active") {
    throw new Error("Warranty cannot be activated in current state.");
  }

  if (product.warrantyStatus === "active") {
    return {
      product: clone(product),
      warrantyStartDate: product.warrantyStartDate,
      warrantyEndDate: product.warrantyEndDate,
      alreadyActive: true,
    };
  }

  const now = new Date();
  const warrantyEndDate = addMonths(now, model.warrantyDurationMonths);
  const parsedInstallationDate = input.installationDate
    ? new Date(input.installationDate)
    : now;
  const installationDate = Number.isNaN(parsedInstallationDate.getTime())
    ? now
    : parsedInstallationDate;

  product.warrantyStatus = "active";
  product.warrantyStartDate = toIso(now);
  product.warrantyEndDate = toIso(warrantyEndDate);
  product.installationDate = toIso(installationDate);
  product.customerName = input.customerName.trim();
  product.customerPhone = sanitizePhone(input.customerPhone);
  product.customerEmail = input.customerEmail ?? null;
  product.customerAddress = input.customerAddress ?? product.customerAddress;

  sticker.status = "activated";

  return {
    product: clone(product),
    warrantyStartDate: product.warrantyStartDate,
    warrantyEndDate: product.warrantyEndDate,
    alreadyActive: false,
  };
}

export function confirmTicket(ticketId: string, action: "confirm" | "reopen", comment?: string) {
  const ticket = requireTicket(ticketId);

  if (action === "confirm") {
    if (ticket.status !== "pending_confirmation" && ticket.status !== "completed") {
      throw new Error("Ticket is not waiting for confirmation.");
    }

    ticket.status = "completed";
    appendTimeline(
      ticket,
      "confirmed",
      comment?.trim() || "Customer confirmed service resolution.",
      "Customer",
      "customer"
    );

    return clone(ticket);
  }

  if (ticket.status !== "pending_confirmation" && ticket.status !== "completed") {
    throw new Error("Ticket cannot be reopened from the current state.");
  }

  ticket.status = "reopened";
  appendTimeline(
    ticket,
    "reopened",
    comment?.trim() || "Customer reported issue not resolved after repair.",
    "Customer",
    "customer"
  );

  return clone(ticket);
}
