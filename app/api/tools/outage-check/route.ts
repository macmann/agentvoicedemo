import { callSupportPortal } from "@/lib/supportPortal/client";
import { NextResponse } from "next/server";

type ServiceStatus = "OPERATIONAL" | "PARTIAL_OUTAGE" | "MAJOR_OUTAGE" | "UNKNOWN";

interface OutageService {
  name?: string;
  region?: string;
  category?: string;
  status?: string;
  updatedAt?: string;
}

interface OutageNotification {
  title?: string;
  body?: string;
  serviceName?: string;
  region?: string;
  category?: string;
  estimatedRecoveryText?: string;
  active?: boolean;
}

interface OutageCheckApiResponse {
  overallStatus?: ServiceStatus | string;
  status?: ServiceStatus | string;
  serviceStatus?: ServiceStatus | string;
  serviceName?: string;
  matchedServiceName?: string;
  region?: string;
  matchedRegion?: string;
  category?: string;
  matchedCategory?: string;
  estimatedRecoveryText?: string;
  announcementTitle?: string;
  announcementBody?: string;
  clarificationNeeded?: boolean;
  clarificationPrompt?: string;
}

function normalize(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function includesText(value: string | undefined, query: string) {
  return normalize(value).includes(normalize(query));
}

function uniqueUpper(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => (value ?? "").trim()).filter(Boolean).map((value) => value.toUpperCase()))];
}

function parseQuery(rawQuery: string | undefined, services: OutageService[]) {
  const query = (rawQuery ?? "").trim();
  const normalizedQuery = normalize(query);
  const categories = uniqueUpper(services.map((service) => service.category));
  const regions = [...new Set(services.flatMap((service) => [service.region, service.name]).filter(Boolean).map((value) => String(value).trim()))];

  const categoryAliases = new Map<string, string>();
  for (const category of categories) {
    categoryAliases.set(category.toLowerCase(), category);
  }
  if (categories.includes("FTTH")) {
    categoryAliases.set("fiber", "FTTH");
    categoryAliases.set("fibre", "FTTH");
    categoryAliases.set("internet", "FTTH");
  }
  if (categories.includes("CABLE")) {
    categoryAliases.set("coax", "CABLE");
    categoryAliases.set("coaxial", "CABLE");
  }

  let parsedRegion: string | undefined;
  for (const region of regions.sort((a, b) => b.length - a.length)) {
    if (includesText(normalizedQuery, region)) {
      parsedRegion = region;
      break;
    }
  }

  let parsedCategory: string | undefined;
  for (const [alias, canonical] of categoryAliases.entries()) {
    const pattern = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(query)) {
      parsedCategory = canonical;
      break;
    }
  }

  return {
    rawQuery: query,
    parsedRegion,
    parsedCategory
  };
}

function findBestNotification(notifications: OutageNotification[], selectedService?: OutageService) {
  if (!selectedService) return undefined;

  return notifications.find((item) => {
    const haystack = [item.title, item.body, item.serviceName, item.region, item.category].map(normalize).join(" ");
    const regionMatch = !!selectedService.region && haystack.includes(normalize(selectedService.region));
    const nameMatch = !!selectedService.name && haystack.includes(normalize(selectedService.name));
    const categoryMatch = !!selectedService.category && haystack.includes(normalize(selectedService.category));
    return (regionMatch || nameMatch) && (!selectedService.category || categoryMatch);
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { request?: { serviceNameOrRegion?: string; active?: boolean } };
  const query = body.request?.serviceNameOrRegion;

  try {
    try {
      const payload = await callSupportPortal<OutageCheckApiResponse>({
        endpoint: "/v1/outages/check",
        method: "POST",
        payload: {
          serviceNameOrRegion: query,
          active: body.request?.active ?? true
        }
      });

      const normalizedStatus = (payload.overallStatus ?? payload.serviceStatus ?? payload.status ?? "UNKNOWN") as ServiceStatus;
      const matchedServiceName = payload.matchedServiceName ?? payload.serviceName;
      const matchedRegion = payload.matchedRegion ?? payload.region;
      const matchedCategory = payload.matchedCategory ?? payload.category;

      return NextResponse.json({
        tool_name: "check_outage_status",
        status: "success",
        result: {
          rawQuery: query ?? "",
          parsedRegion: matchedRegion,
          parsedCategory: matchedCategory,
          matchedServiceName,
          matchedRegion,
          matchedCategory,
          overallStatus: normalizedStatus,
          serviceStatus: payload.serviceStatus ?? payload.status,
          announcementTitle: payload.announcementTitle,
          announcementBody: payload.announcementBody,
          estimatedRecoveryText: payload.estimatedRecoveryText,
          clarificationNeeded: payload.clarificationNeeded ?? false,
          clarificationPrompt: payload.clarificationPrompt,
          source: {
            serviceStatusUsed: true,
            notificationsUsed: true
          },
          debug: {
            parsedRegion: matchedRegion,
            parsedCategory: matchedCategory,
            candidateMatchesFound: {
              region: [],
              category: [],
              combined: []
            },
            selectedMatch: matchedServiceName || matchedRegion ? {
              name: matchedServiceName,
              region: matchedRegion,
              category: matchedCategory,
              status: payload.serviceStatus ?? payload.status
            } : null,
            clarificationReason: payload.clarificationNeeded ? payload.clarificationPrompt ?? "Additional details required by upstream outage API" : null
          }
        }
      });
    } catch {
      // Fall back to legacy split-feed aggregation for environments that only expose /api/* endpoints.
    }

    const [serviceStatus, notifications] = await Promise.all([
      callSupportPortal<{ services?: OutageService[] }>({
        endpoint: "/api/service-status",
        method: "GET",
        query: { active: body.request?.active ?? true }
      }),
      callSupportPortal<{ notifications?: OutageNotification[] }>({
        endpoint: "/api/notifications",
        method: "GET",
        query: { active: body.request?.active ?? true }
      })
    ]);

    const services = serviceStatus.services ?? [];
    const announcementList = notifications.notifications ?? [];
    const { rawQuery, parsedRegion, parsedCategory } = parseQuery(query, services);

    const regionCandidates = parsedRegion
      ? services.filter((service) => includesText(service.name, parsedRegion) || includesText(service.region, parsedRegion))
      : [];
    const categoryCandidates = parsedCategory
      ? services.filter((service) => normalize(service.category) === normalize(parsedCategory))
      : [];
    const combinedCandidates = parsedRegion && parsedCategory
      ? services.filter((service) => (includesText(service.name, parsedRegion) || includesText(service.region, parsedRegion)) && normalize(service.category) === normalize(parsedCategory))
      : [];

    let selectedService: OutageService | undefined;
    let clarificationNeeded = false;
    let clarificationPrompt: string | undefined;

    if (parsedRegion && parsedCategory && combinedCandidates.length > 0) {
      selectedService = combinedCandidates[0];
    } else if (parsedRegion && !parsedCategory) {
      if (regionCandidates.length === 1) {
        selectedService = regionCandidates[0];
      } else if (regionCandidates.length > 1) {
        clarificationNeeded = true;
        clarificationPrompt = `I found multiple services for ${parsedRegion}. Do you mean ${uniqueUpper(regionCandidates.map((service) => service.category)).join(" or ")}?`;
      }
    } else if (!parsedRegion && parsedCategory) {
      if (categoryCandidates.length === 1) {
        selectedService = categoryCandidates[0];
      } else if (categoryCandidates.length > 1) {
        clarificationNeeded = true;
        clarificationPrompt = `I found multiple regions for ${parsedCategory}. Which region should I check?`;
      }
    }

    if (!selectedService && !clarificationNeeded && parsedRegion && parsedCategory && combinedCandidates.length === 0) {
      clarificationNeeded = true;
      clarificationPrompt = `I could not find a ${parsedCategory} service in ${parsedRegion}. Please confirm the region or category.`;
    }

    if (!selectedService && !clarificationNeeded && !parsedRegion && !parsedCategory) {
      clarificationNeeded = true;
      clarificationPrompt = "Please share the region and service type (for example: FTTH in Berlin) so I can check outages.";
    }

    const matchedNotification = findBestNotification(announcementList, selectedService);

    if (!selectedService) {
      return NextResponse.json({
        tool_name: "check_outage_status",
        status: "success",
        result: {
          parsedRegion,
          parsedCategory,
          rawQuery,
          overallStatus: "UNKNOWN",
          clarificationNeeded: true,
          clarificationPrompt,
          source: { serviceStatusUsed: true, notificationsUsed: true },
          debug: {
            parsedRegion,
            parsedCategory,
            candidateMatchesFound: {
              region: regionCandidates.map((service) => ({ name: service.name, region: service.region, category: service.category, status: service.status })),
              category: categoryCandidates.map((service) => ({ name: service.name, region: service.region, category: service.category, status: service.status })),
              combined: combinedCandidates.map((service) => ({ name: service.name, region: service.region, category: service.category, status: service.status }))
            },
            selectedMatch: null,
            clarificationReason: clarificationPrompt ?? "No confident match found"
          }
        }
      });
    }
    const overallStatus = (selectedService.status ?? (matchedNotification ? "PARTIAL_OUTAGE" : "UNKNOWN")) as ServiceStatus;

    return NextResponse.json({
      tool_name: "check_outage_status",
      status: "success",
      result: {
        rawQuery,
        parsedRegion,
        parsedCategory,
        matchedServiceName: selectedService.name ?? matchedNotification?.serviceName,
        matchedRegion: selectedService.region ?? matchedNotification?.region ?? selectedService.name,
        matchedCategory: selectedService.category,
        overallStatus,
        serviceStatus: selectedService.status,
        announcementTitle: matchedNotification?.title,
        announcementBody: matchedNotification?.body,
        estimatedRecoveryText: matchedNotification?.estimatedRecoveryText,
        clarificationNeeded,
        source: {
          serviceStatusUsed: true,
          notificationsUsed: true
        },
        debug: {
          parsedRegion,
          parsedCategory,
          candidateMatchesFound: {
            region: regionCandidates.map((service) => ({ name: service.name, region: service.region, category: service.category, status: service.status })),
            category: categoryCandidates.map((service) => ({ name: service.name, region: service.region, category: service.category, status: service.status })),
            combined: combinedCandidates.map((service) => ({ name: service.name, region: service.region, category: service.category, status: service.status }))
          },
          selectedMatch: {
            name: selectedService.name,
            region: selectedService.region,
            category: selectedService.category,
            status: selectedService.status
          },
          clarificationReason: null
        }
      }
    });
  } catch (error) {
    return NextResponse.json({ status: "failure", error: error instanceof Error ? error.message : "Outage API failed" }, { status: 502 });
  }
}
