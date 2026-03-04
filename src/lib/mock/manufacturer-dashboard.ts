export type TicketStatus = "new" | "assigned" | "in_progress" | "awaiting_parts"
export type ClaimStatus = "submitted" | "under_review" | "approved" | "rejected" | "paid"

export type ProductModel = {
  id: string
  name: string
  category: string
  subCategory: string
  modelNumber: string
  description: string
  imageUrl: string
  warrantyDurationMonths: number
  totalUnits: number
  commonIssues: string[]
  requiredSkills: string[]
}

export type AllocationHistoryItem = {
  id: string
  allocationId: string
  date: string
  stickerStart: number
  stickerEnd: number
  serialPrefix: string
  serialStart: number
  serialEnd: number
  productModelId: string
}

export type ServiceCenter = {
  id: string
  name: string
  city: string
  supportedCategories: string[]
  rating: number
  totalJobsCompleted: number
  technicians: Array<{
    id: string
    name: string
    skillset: string[]
    jobsCompleted: number
    firstTimeFixRate: number
  }>
  performance: {
    avgResolutionHours: number
    claimAccuracy: number
    customerSatisfaction: number
  }
}

export type ClaimDocumentation = {
  photos: string[]
  timestamps: string[]
  partsUsed: string[]
  technicianNotes: string
}

export type Claim = {
  id: string
  claimNumber: string
  ticketReference: string
  product: string
  serviceCenter: string
  amount: number
  status: ClaimStatus
  submittedDate: string
  documentation: ClaimDocumentation
}

export const productCatalogSeed: ProductModel[] = [
  {
    id: "pm-101",
    name: "AstraCool Inverter Split AC 1.5T",
    category: "Air Conditioner",
    subCategory: "Inverter Split",
    modelNumber: "AC-INV-15-AX",
    description:
      "Energy efficient split AC with smart diagnostics and anti-corrosion coils.",
    imageUrl: "/globe.svg",
    warrantyDurationMonths: 36,
    totalUnits: 9240,
    commonIssues: ["Gas leakage", "PCB failure", "Sensor drift"],
    requiredSkills: ["HVAC", "PCB Repair", "Refrigerant Handling"],
  },
  {
    id: "pm-102",
    name: "ThermoWash Front Load 8kg",
    category: "Washing Machine",
    subCategory: "Front Load",
    modelNumber: "WM-FL-800-TW",
    description:
      "8kg front load washer with steam hygiene and auto-dosing support.",
    imageUrl: "/window.svg",
    warrantyDurationMonths: 24,
    totalUnits: 7325,
    commonIssues: ["Drain pump block", "Door lock fault"],
    requiredSkills: ["Mechanical Repair", "Motor Diagnostics"],
  },
  {
    id: "pm-103",
    name: "FreshMax Double Door 420L",
    category: "Refrigerator",
    subCategory: "Double Door",
    modelNumber: "RF-DD-420-FM",
    description:
      "Frost-free double door refrigerator with inverter compressor.",
    imageUrl: "/file.svg",
    warrantyDurationMonths: 48,
    totalUnits: 11080,
    commonIssues: ["Compressor trip", "Thermostat drift"],
    requiredSkills: ["Cooling Systems", "Compressor Service"],
  },
  {
    id: "pm-104",
    name: "HeatPro Induction Cooktop 2Z",
    category: "Kitchen Appliance",
    subCategory: "Cooktop",
    modelNumber: "KC-IN-2Z-HP",
    description:
      "Dual-zone induction cooktop with child lock and surge protection.",
    imageUrl: "/next.svg",
    warrantyDurationMonths: 18,
    totalUnits: 4180,
    commonIssues: ["Touch panel unresponsive", "Coil overheating"],
    requiredSkills: ["Electrical Diagnostics", "Component Swap"],
  },
  {
    id: "pm-105",
    name: "PureWave Smart Water Purifier",
    category: "Water Purifier",
    subCategory: "RO + UV",
    modelNumber: "WP-ROUV-PW",
    description:
      "Connected water purifier with TDS monitor and app alerts.",
    imageUrl: "/vercel.svg",
    warrantyDurationMonths: 30,
    totalUnits: 6750,
    commonIssues: ["RO membrane clog", "Flow sensor failure"],
    requiredSkills: ["Filter Replacement", "IoT Diagnostics"],
  },
]

export const openTicketStatusCounts: Array<{
  status: TicketStatus
  label: string
  count: number
}> = [
  { status: "new", label: "New", count: 32 },
  { status: "assigned", label: "Assigned", count: 47 },
  { status: "in_progress", label: "In Progress", count: 58 },
  { status: "awaiting_parts", label: "Awaiting Parts", count: 21 },
]

export const monthlyWarrantyCostTrend = [
  { month: "Sep", cost: 142000, claims: 88 },
  { month: "Oct", cost: 156500, claims: 94 },
  { month: "Nov", cost: 149200, claims: 90 },
  { month: "Dec", cost: 171000, claims: 103 },
  { month: "Jan", cost: 164300, claims: 98 },
  { month: "Feb", cost: 178900, claims: 112 },
]

export const stickerInventorySeed = {
  totalAllocated: 125000,
  totalBound: 88940,
  totalActivated: 74612,
  totalAvailable: 36060,
}

export const allocationHistorySeed: AllocationHistoryItem[] = [
  {
    id: "a-1",
    allocationId: "ALLOC-2026-0021",
    date: "2026-02-24",
    stickerStart: 910000,
    stickerEnd: 910499,
    serialPrefix: "AX-IND-BLR",
    serialStart: 50001,
    serialEnd: 50500,
    productModelId: "pm-101",
  },
  {
    id: "a-2",
    allocationId: "ALLOC-2026-0018",
    date: "2026-02-12",
    stickerStart: 909000,
    stickerEnd: 909399,
    serialPrefix: "TW-CHN-HYD",
    serialStart: 22001,
    serialEnd: 22400,
    productModelId: "pm-102",
  },
  {
    id: "a-3",
    allocationId: "ALLOC-2026-0013",
    date: "2026-01-29",
    stickerStart: 907500,
    stickerEnd: 907999,
    serialPrefix: "FM-MUM-NV",
    serialStart: 82001,
    serialEnd: 82500,
    productModelId: "pm-103",
  },
]

export const serviceCentersSeed: ServiceCenter[] = [
  {
    id: "sc-11",
    name: "PrimeFix Service Hub",
    city: "Bengaluru",
    supportedCategories: ["Air Conditioner", "Refrigerator", "Washing Machine"],
    rating: 4.7,
    totalJobsCompleted: 4321,
    technicians: [
      {
        id: "t-101",
        name: "Rajesh K",
        skillset: ["HVAC", "Cooling Systems"],
        jobsCompleted: 611,
        firstTimeFixRate: 88,
      },
      {
        id: "t-102",
        name: "Deepa R",
        skillset: ["Compressor Service", "Motor Diagnostics"],
        jobsCompleted: 524,
        firstTimeFixRate: 91,
      },
    ],
    performance: {
      avgResolutionHours: 27,
      claimAccuracy: 96,
      customerSatisfaction: 4.8,
    },
  },
  {
    id: "sc-12",
    name: "MetroCare Appliances",
    city: "Hyderabad",
    supportedCategories: ["Water Purifier", "Kitchen Appliance", "Washing Machine"],
    rating: 4.5,
    totalJobsCompleted: 3562,
    technicians: [
      {
        id: "t-103",
        name: "Arun P",
        skillset: ["Electrical Diagnostics", "IoT Diagnostics"],
        jobsCompleted: 490,
        firstTimeFixRate: 84,
      },
      {
        id: "t-104",
        name: "Sneha M",
        skillset: ["Filter Replacement", "Component Swap"],
        jobsCompleted: 451,
        firstTimeFixRate: 87,
      },
    ],
    performance: {
      avgResolutionHours: 31,
      claimAccuracy: 93,
      customerSatisfaction: 4.6,
    },
  },
  {
    id: "sc-13",
    name: "RapidServe North",
    city: "Delhi",
    supportedCategories: ["Air Conditioner", "Refrigerator"],
    rating: 4.3,
    totalJobsCompleted: 2874,
    technicians: [
      {
        id: "t-105",
        name: "Vivek S",
        skillset: ["HVAC", "PCB Repair"],
        jobsCompleted: 418,
        firstTimeFixRate: 82,
      },
      {
        id: "t-106",
        name: "Niharika T",
        skillset: ["Cooling Systems", "Compressor Service"],
        jobsCompleted: 389,
        firstTimeFixRate: 85,
      },
    ],
    performance: {
      avgResolutionHours: 35,
      claimAccuracy: 91,
      customerSatisfaction: 4.4,
    },
  },
]

export const claimsSeed: Claim[] = [
  {
    id: "cl-3001",
    claimNumber: "WCL-2026-3001",
    ticketReference: "TCK-88931",
    product: "AstraCool Inverter Split AC 1.5T",
    serviceCenter: "PrimeFix Service Hub",
    amount: 7400,
    status: "submitted",
    submittedDate: "2026-03-01",
    documentation: {
      photos: ["Compressor assembly", "Sensor connector", "Final testing"],
      timestamps: ["2026-02-28 11:12", "2026-02-28 12:03", "2026-02-28 13:20"],
      partsUsed: ["Compressor relay", "Temperature sensor"],
      technicianNotes:
        "Outdoor unit had intermittent cut-off due to failing relay. Replaced relay and sensor, ran load test for 40 minutes with stable current draw.",
    },
  },
  {
    id: "cl-3002",
    claimNumber: "WCL-2026-3002",
    ticketReference: "TCK-88977",
    product: "PureWave Smart Water Purifier",
    serviceCenter: "MetroCare Appliances",
    amount: 3150,
    status: "under_review",
    submittedDate: "2026-03-02",
    documentation: {
      photos: ["RO membrane old", "New membrane installed"],
      timestamps: ["2026-03-01 09:45", "2026-03-01 10:20"],
      partsUsed: ["RO membrane kit", "Flow restrictor"],
      technicianNotes:
        "Customer reported low flow and high TDS. Replaced membrane and recalibrated flow restrictor. Final TDS is within acceptable range.",
    },
  },
  {
    id: "cl-3003",
    claimNumber: "WCL-2026-2992",
    ticketReference: "TCK-88765",
    product: "FreshMax Double Door 420L",
    serviceCenter: "RapidServe North",
    amount: 8600,
    status: "approved",
    submittedDate: "2026-02-25",
    documentation: {
      photos: ["Compressor mount", "Gas refill station"],
      timestamps: ["2026-02-24 15:10", "2026-02-24 16:02"],
      partsUsed: ["Compressor isolator", "Refrigerant refill"],
      technicianNotes:
        "Noise and cooling fluctuations traced to worn compressor mount. Replaced mount and topped up refrigerant as per model chart.",
    },
  },
  {
    id: "cl-3004",
    claimNumber: "WCL-2026-2980",
    ticketReference: "TCK-88540",
    product: "ThermoWash Front Load 8kg",
    serviceCenter: "PrimeFix Service Hub",
    amount: 2900,
    status: "rejected",
    submittedDate: "2026-02-21",
    documentation: {
      photos: ["Drain pump area", "Lint filter"],
      timestamps: ["2026-02-20 10:41", "2026-02-20 11:05"],
      partsUsed: ["Drain pump"],
      technicianNotes:
        "Root cause was external debris blockage. Pump replacement was not necessary as original pump passed diagnostics.",
    },
  },
  {
    id: "cl-3005",
    claimNumber: "WCL-2026-2961",
    ticketReference: "TCK-88019",
    product: "HeatPro Induction Cooktop 2Z",
    serviceCenter: "MetroCare Appliances",
    amount: 1800,
    status: "paid",
    submittedDate: "2026-02-09",
    documentation: {
      photos: ["Touch PCB", "Panel reseat"],
      timestamps: ["2026-02-08 14:21", "2026-02-08 15:17"],
      partsUsed: ["Touch PCB"],
      technicianNotes:
        "Touch panel ghost inputs due to PCB moisture damage. Replaced PCB and updated firmware patch.",
    },
  },
]

export const topIssueByModel = [
  { model: "AstraCool Inverter Split AC 1.5T", issue: "Gas leakage", incidents: 42 },
  { model: "ThermoWash Front Load 8kg", issue: "Drain pump block", incidents: 35 },
  { model: "FreshMax Double Door 420L", issue: "Thermostat drift", incidents: 28 },
  { model: "PureWave Smart Water Purifier", issue: "RO membrane clog", incidents: 24 },
]
