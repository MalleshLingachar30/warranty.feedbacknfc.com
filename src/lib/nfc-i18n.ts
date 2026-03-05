export type NfcLanguage = "en" | "hi";

type NfcCopy = {
  shellSubtitle: string;
  languageLabel: string;
  languageEnglish: string;
  languageHindi: string;
  customerProductView: {
    warrantyStatus: string;
    validUntil: string;
    activeBadge: string;
    daysRemaining: string;
    openServiceRequest: string;
    ticketLabel: string;
    reported: string;
    reportIssue: string;
    issueCategory: string;
    issueDescription: string;
    issueDescriptionPlaceholder: string;
    issueSeverity: string;
    uploadPhotos: string;
    phoneNumber: string;
    phonePlaceholder: string;
    cancel: string;
    submit: string;
    submitting: string;
    productInformation: string;
    serviceHistory: string;
    noServiceHistory: string;
    selectIssueCategoryError: string;
    issueDescriptionError: string;
    phoneValidationError: string;
    uploadLimitError: string;
    reportSuccessFallback: string;
    generalIssue: string;
    issueCategoryFallback: string;
    productLabel: string;
    manufacturerLabel: string;
    modelLabel: string;
    serialLabel: string;
    warrantyEndsFallback: string;
    openTicketReportedPrefix: string;
    openTicketReportedNow: string;
    openTicketReportedHours: string;
    openTicketReportedDays: string;
    downloadCertificate: string;
  };
  warrantyActivation: {
    title: string;
    description: string;
    footer: string;
    activatedTitle: string;
    activatedDescription: string;
    activatedFooter: string;
    activatedSuccess: string;
    downloadCertificate: string;
    customerName: string;
    phoneNumber: string;
    otpPlaceholder: string;
    emailOptional: string;
    addressOptional: string;
    installationDate: string;
    activateButton: string;
    activatingButton: string;
    networkError: string;
    productImage: string;
    warrantyDurationSuffix: string;
    manufacturerLabel: string;
    modelLabel: string;
    serialLabel: string;
    requiredIndicator: string;
  };
  customerTicketTracker: {
    title: string;
    description: string;
    footer: string;
    issueLabel: string;
    reportedOnLabel: string;
    productSummary: string;
    productFallback: string;
    modelLabel: string;
    serialLabel: string;
    manufacturerLabel: string;
    progress: string;
    assignedTechnician: string;
    nameLabel: string;
    assignedSoon: string;
    phoneLabel: string;
    notAvailable: string;
    etaLabel: string;
    eventTimeline: string;
    noTimelineEvents: string;
    systemActor: string;
    trackingSteps: Record<string, string>;
  };
  customerConfirmResolution: {
    title: string;
    description: string;
    footer: string;
    issueLabel: string;
    reportedOnLabel: string;
    technicianLabel: string;
    assignedTechnician: string;
    resolutionSummary: string;
    noNotes: string;
    resolutionPhotos: string;
    noPhotos: string;
    partsUsed: string;
    noParts: string;
    confirmResolution: string;
    issueNotResolved: string;
    unresolvedHint: string;
    updateError: string;
    updateSuccess: string;
    networkError: string;
  };
  common: {
    severityLow: string;
    severityMedium: string;
    severityHigh: string;
    severityCritical: string;
  };
};

const NFC_COPY: Record<NfcLanguage, NfcCopy> = {
  en: {
    shellSubtitle: "Warranty Smart Sticker",
    languageLabel: "Language",
    languageEnglish: "English",
    languageHindi: "हिंदी",
    customerProductView: {
      warrantyStatus: "Warranty Status",
      validUntil: "Valid until",
      activeBadge: "Active",
      daysRemaining: "days remaining",
      openServiceRequest: "Open Service Request",
      ticketLabel: "Ticket",
      reported: "Reported",
      reportIssue: "Report Issue",
      issueCategory: "Issue category",
      issueDescription: "Issue description",
      issueDescriptionPlaceholder: "Describe what is happening with the product",
      issueSeverity: "Issue severity",
      uploadPhotos: "Upload photos (up to 5)",
      phoneNumber: "Phone number",
      phonePlaceholder: "Enter contact number",
      cancel: "Cancel",
      submit: "Submit Request",
      submitting: "Submitting...",
      productInformation: "Product Information",
      serviceHistory: "Service History",
      noServiceHistory: "No prior service activity found for this product.",
      selectIssueCategoryError: "Select an issue category.",
      issueDescriptionError: "Describe the issue with at least 10 characters.",
      phoneValidationError: "Enter a valid phone number.",
      uploadLimitError: "You can upload up to 5 photos.",
      reportSuccessFallback:
        "Service request submitted! Ticket #WRT-2026-XXXXXX. A technician will be assigned shortly.",
      generalIssue: "General issue",
      issueCategoryFallback: "Issue",
      productLabel: "Product",
      manufacturerLabel: "Manufacturer",
      modelLabel: "Model",
      serialLabel: "Serial",
      warrantyEndsFallback: "Warranty dates will appear after activation.",
      openTicketReportedPrefix: "Reported",
      openTicketReportedNow: "just now",
      openTicketReportedHours: "h ago",
      openTicketReportedDays: "d ago",
      downloadCertificate: "Download Warranty Certificate",
    },
    warrantyActivation: {
      title: "Activate Product Warranty",
      description:
        "Complete this one-time form to activate your warranty and unlock service support.",
      footer: "OTP verification is currently stubbed for MVP testing.",
      activatedTitle: "Warranty Activated",
      activatedDescription: "Warranty Activated! Valid until",
      activatedFooter:
        "You can scan this sticker anytime to raise a service request and track progress.",
      activatedSuccess: "Warranty activation completed successfully.",
      downloadCertificate: "Download Warranty Certificate",
      customerName: "Customer Name",
      phoneNumber: "Phone Number",
      otpPlaceholder: "Enter OTP (stubbed for now)",
      emailOptional: "Email (Optional)",
      addressOptional: "Address (Optional)",
      installationDate: "Installation Date",
      activateButton: "Activate Warranty",
      activatingButton: "Activating warranty...",
      networkError: "Network error while activating warranty. Please try again.",
      productImage: "Product Image",
      warrantyDurationSuffix: "Manufacturer Warranty",
      manufacturerLabel: "Manufacturer",
      modelLabel: "Model",
      serialLabel: "Serial Number",
      requiredIndicator: "*",
    },
    customerTicketTracker: {
      title: "Track Service Request",
      description:
        "Your request is active. Follow each service stage in real time.",
      footer: "Need urgent support? Use the assigned technician contact below.",
      issueLabel: "Issue",
      reportedOnLabel: "Reported on",
      productSummary: "Product Summary",
      productFallback: "Product",
      modelLabel: "Model",
      serialLabel: "Serial",
      manufacturerLabel: "Manufacturer",
      progress: "Progress",
      assignedTechnician: "Assigned Technician",
      nameLabel: "Name",
      assignedSoon: "Will be assigned soon",
      phoneLabel: "Phone",
      notAvailable: "Not available",
      etaLabel: "ETA",
      eventTimeline: "Event Timeline",
      noTimelineEvents: "No timeline events yet.",
      systemActor: "System",
      trackingSteps: {
        reported: "Reported",
        assigned: "Assigned",
        technician_enroute: "Technician En Route",
        work_in_progress: "Work In Progress",
        pending_confirmation: "Pending Confirmation",
        resolved: "Resolved",
      },
    },
    customerConfirmResolution: {
      title: "Confirm Service Resolution",
      description:
        "Your technician marked this request as completed. Please confirm whether the issue is fully resolved.",
      footer:
        "Your confirmation closes the service request and helps improve service quality.",
      issueLabel: "Issue",
      reportedOnLabel: "Reported on",
      technicianLabel: "Technician",
      assignedTechnician: "Assigned technician",
      resolutionSummary: "Resolution Summary",
      noNotes: "No technician notes provided.",
      resolutionPhotos: "Resolution Photos",
      noPhotos: "No photos uploaded.",
      partsUsed: "Parts Used",
      noParts: "No parts listed.",
      confirmResolution: "Confirm Resolution",
      issueNotResolved: "Issue Not Resolved",
      unresolvedHint: "If unresolved, the ticket will be reopened for further action.",
      updateError: "Unable to update ticket status.",
      updateSuccess: "Ticket updated successfully.",
      networkError: "Network error while updating resolution status.",
    },
    common: {
      severityLow: "Low",
      severityMedium: "Medium",
      severityHigh: "High",
      severityCritical: "Critical",
    },
  },
  hi: {
    shellSubtitle: "वारंटी स्मार्ट स्टिकर",
    languageLabel: "भाषा",
    languageEnglish: "English",
    languageHindi: "हिंदी",
    customerProductView: {
      warrantyStatus: "वारंटी स्थिति",
      validUntil: "वैधता",
      activeBadge: "सक्रिय",
      daysRemaining: "दिन शेष",
      openServiceRequest: "खुला सर्विस अनुरोध",
      ticketLabel: "टिकट",
      reported: "रिपोर्ट किया गया",
      reportIssue: "समस्या दर्ज करें",
      issueCategory: "समस्या श्रेणी",
      issueDescription: "समस्या विवरण",
      issueDescriptionPlaceholder: "उत्पाद में क्या समस्या है, लिखें",
      issueSeverity: "समस्या गंभीरता",
      uploadPhotos: "फोटो अपलोड करें (अधिकतम 5)",
      phoneNumber: "फोन नंबर",
      phonePlaceholder: "संपर्क नंबर दर्ज करें",
      cancel: "रद्द करें",
      submit: "अनुरोध भेजें",
      submitting: "भेजा जा रहा है...",
      productInformation: "उत्पाद जानकारी",
      serviceHistory: "सर्विस इतिहास",
      noServiceHistory: "इस उत्पाद के लिए अभी तक कोई सर्विस इतिहास नहीं है।",
      selectIssueCategoryError: "कृपया समस्या श्रेणी चुनें।",
      issueDescriptionError: "कृपया कम से कम 10 अक्षरों में समस्या लिखें।",
      phoneValidationError: "कृपया मान्य फोन नंबर दर्ज करें।",
      uploadLimitError: "आप अधिकतम 5 फोटो अपलोड कर सकते हैं।",
      reportSuccessFallback:
        "सर्विस अनुरोध दर्ज हो गया। तकनीशियन जल्द असाइन किया जाएगा।",
      generalIssue: "सामान्य समस्या",
      issueCategoryFallback: "समस्या",
      productLabel: "उत्पाद",
      manufacturerLabel: "निर्माता",
      modelLabel: "मॉडल",
      serialLabel: "सीरियल",
      warrantyEndsFallback: "एक्टिवेशन के बाद वारंटी तिथियां दिखाई देंगी।",
      openTicketReportedPrefix: "रिपोर्ट किया गया",
      openTicketReportedNow: "अभी",
      openTicketReportedHours: "घंटे पहले",
      openTicketReportedDays: "दिन पहले",
      downloadCertificate: "वारंटी प्रमाणपत्र डाउनलोड करें",
    },
    warrantyActivation: {
      title: "उत्पाद वारंटी सक्रिय करें",
      description:
        "वारंटी सक्रिय करने और सर्विस सपोर्ट पाने के लिए यह एक बार वाला फॉर्म भरें।",
      footer: "MVP टेस्टिंग के लिए OTP सत्यापन फिलहाल स्टब किया गया है।",
      activatedTitle: "वारंटी सक्रिय हुई",
      activatedDescription: "वारंटी सफलतापूर्वक सक्रिय हुई! वैधता",
      activatedFooter:
        "इस स्टिकर को स्कैन करके आप कभी भी सर्विस अनुरोध दर्ज कर सकते हैं।",
      activatedSuccess: "वारंटी सक्रियण सफलतापूर्वक पूरा हुआ।",
      downloadCertificate: "वारंटी प्रमाणपत्र डाउनलोड करें",
      customerName: "ग्राहक का नाम",
      phoneNumber: "फोन नंबर",
      otpPlaceholder: "OTP दर्ज करें (फिलहाल स्टब)",
      emailOptional: "ईमेल (वैकल्पिक)",
      addressOptional: "पता (वैकल्पिक)",
      installationDate: "इंस्टॉलेशन तिथि",
      activateButton: "वारंटी सक्रिय करें",
      activatingButton: "वारंटी सक्रिय की जा रही है...",
      networkError: "नेटवर्क त्रुटि। कृपया दोबारा प्रयास करें।",
      productImage: "उत्पाद चित्र",
      warrantyDurationSuffix: "निर्माता वारंटी",
      manufacturerLabel: "निर्माता",
      modelLabel: "मॉडल",
      serialLabel: "सीरियल नंबर",
      requiredIndicator: "*",
    },
    customerTicketTracker: {
      title: "सर्विस अनुरोध ट्रैक करें",
      description: "आपका अनुरोध सक्रिय है। हर स्टेज की स्थिति देखें।",
      footer: "तुरंत मदद चाहिए? नीचे दिए तकनीशियन से संपर्क करें।",
      issueLabel: "समस्या",
      reportedOnLabel: "रिपोर्ट तिथि",
      productSummary: "उत्पाद सारांश",
      productFallback: "उत्पाद",
      modelLabel: "मॉडल",
      serialLabel: "सीरियल",
      manufacturerLabel: "निर्माता",
      progress: "प्रगति",
      assignedTechnician: "असाइन तकनीशियन",
      nameLabel: "नाम",
      assignedSoon: "जल्द असाइन किया जाएगा",
      phoneLabel: "फोन",
      notAvailable: "उपलब्ध नहीं",
      etaLabel: "ETA",
      eventTimeline: "इवेंट टाइमलाइन",
      noTimelineEvents: "अभी कोई टाइमलाइन इवेंट नहीं है।",
      systemActor: "सिस्टम",
      trackingSteps: {
        reported: "रिपोर्ट किया गया",
        assigned: "असाइन किया गया",
        technician_enroute: "तकनीशियन रास्ते में",
        work_in_progress: "काम जारी है",
        pending_confirmation: "पुष्टि लंबित",
        resolved: "समाधान हो गया",
      },
    },
    customerConfirmResolution: {
      title: "सेवा समाधान की पुष्टि करें",
      description:
        "तकनीशियन ने कार्य पूरा बताया है। कृपया पुष्टि करें कि समस्या पूरी तरह हल हुई है।",
      footer:
        "आपकी पुष्टि से टिकट बंद होता है और सेवा गुणवत्ता बेहतर होती है।",
      issueLabel: "समस्या",
      reportedOnLabel: "रिपोर्ट तिथि",
      technicianLabel: "तकनीशियन",
      assignedTechnician: "असाइन तकनीशियन",
      resolutionSummary: "समाधान सारांश",
      noNotes: "तकनीशियन नोट्स उपलब्ध नहीं हैं।",
      resolutionPhotos: "समाधान फोटो",
      noPhotos: "कोई फोटो अपलोड नहीं की गई।",
      partsUsed: "उपयोग किए गए पार्ट्स",
      noParts: "कोई पार्ट सूचीबद्ध नहीं है।",
      confirmResolution: "समाधान की पुष्टि करें",
      issueNotResolved: "समस्या हल नहीं हुई",
      unresolvedHint: "समस्या हल न होने पर टिकट फिर से खोला जाएगा।",
      updateError: "टिकट स्थिति अपडेट नहीं हो सकी।",
      updateSuccess: "टिकट सफलतापूर्वक अपडेट हुआ।",
      networkError: "नेटवर्क त्रुटि। कृपया पुनः प्रयास करें।",
    },
    common: {
      severityLow: "कम",
      severityMedium: "मध्यम",
      severityHigh: "उच्च",
      severityCritical: "गंभीर",
    },
  },
};

export function normalizeNfcLanguage(
  value: string | null | undefined,
  fallback: NfcLanguage = "en",
): NfcLanguage {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "hi" || normalized.startsWith("hi-")) {
    return "hi";
  }

  if (normalized === "en" || normalized.startsWith("en-")) {
    return "en";
  }

  return fallback;
}

export function detectNfcLanguage(input: {
  queryLang?: string | null;
  preferredLanguage?: string | null;
  acceptLanguageHeader?: string | null;
}): NfcLanguage {
  const fromQuery = normalizeNfcLanguage(input.queryLang);
  if (input.queryLang) {
    return fromQuery;
  }

  const fromPreference = normalizeNfcLanguage(input.preferredLanguage);
  if (input.preferredLanguage) {
    return fromPreference;
  }

  if (input.acceptLanguageHeader) {
    const headerParts = input.acceptLanguageHeader
      .split(",")
      .map((part) => part.split(";")[0]?.trim())
      .filter((part): part is string => Boolean(part));

    for (const part of headerParts) {
      const detected = normalizeNfcLanguage(part);
      if (detected === "hi" || detected === "en") {
        return detected;
      }
    }
  }

  return "en";
}

export function getNfcCopy(lang: NfcLanguage): NfcCopy {
  return NFC_COPY[lang];
}

export function translateTicketStatus(status: string, lang: NfcLanguage): string {
  if (lang === "en") {
    return status.replace(/_/g, " ");
  }

  const map: Record<string, string> = {
    reported: "रिपोर्ट किया गया",
    assigned: "असाइन किया गया",
    technician_enroute: "तकनीशियन रास्ते में",
    work_in_progress: "काम जारी है",
    pending_confirmation: "पुष्टि लंबित",
    resolved: "समाधान हो गया",
    reopened: "फिर से खोला गया",
    escalated: "एस्केलेट किया गया",
    closed: "बंद",
  };

  return map[status] ?? status.replace(/_/g, " ");
}

export function translateSeverityLabel(
  severity: "low" | "medium" | "high" | "critical",
  lang: NfcLanguage,
): string {
  const copy = getNfcCopy(lang);
  switch (severity) {
    case "low":
      return copy.common.severityLow;
    case "medium":
      return copy.common.severityMedium;
    case "high":
      return copy.common.severityHigh;
    case "critical":
      return copy.common.severityCritical;
    default:
      return severity;
  }
}
