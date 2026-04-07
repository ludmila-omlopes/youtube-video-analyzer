import type {
  AnalysisExecutionContext,
  MetadataToolOutput,
  VideoAnalysisServiceLike,
} from "../youtube-core/index.js";

const monetizationScanSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    detectedLanguage: { type: "string" },
    executiveSummary: { type: "string" },
    monetizationReadiness: {
      type: "string",
      enum: ["high", "medium", "low"],
    },
    revenueAngles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          angle: { type: "string" },
          whyItFits: { type: "string" },
          audienceSignal: { type: "string" },
        },
        required: ["angle", "whyItFits", "audienceSignal"],
      },
    },
    affiliateOpportunities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          timestamp: { type: "string" },
          title: { type: "string" },
          productOrOffer: { type: "string" },
          whyThisMomentFits: { type: "string" },
        },
        required: ["timestamp", "title", "productOrOffer", "whyThisMomentFits"],
      },
    },
    sponsorSegments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          timestamp: { type: "string" },
          title: { type: "string" },
          sponsorType: { type: "string" },
          pitchAngle: { type: "string" },
        },
        required: ["timestamp", "title", "sponsorType", "pitchAngle"],
      },
    },
    ctaMoments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          timestamp: { type: "string" },
          cta: { type: "string" },
          rationale: { type: "string" },
        },
        required: ["timestamp", "cta", "rationale"],
      },
    },
    repurposingHooks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          whyItCouldConvert: { type: "string" },
        },
        required: ["title", "whyItCouldConvert"],
      },
    },
    risks: {
      type: "array",
      items: { type: "string" },
    },
    nextActions: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "detectedLanguage",
    "executiveSummary",
    "monetizationReadiness",
    "revenueAngles",
    "affiliateOpportunities",
    "sponsorSegments",
    "ctaMoments",
    "repurposingHooks",
    "risks",
    "nextActions",
  ],
} as const;

export type MonetizationScanInput = {
  youtubeUrl: string;
  focus?: string;
  startOffsetSeconds?: number;
  endOffsetSeconds?: number;
};

export type MonetizationScanAnalysis = {
  detectedLanguage: string;
  executiveSummary: string;
  monetizationReadiness: "high" | "medium" | "low";
  revenueAngles: Array<{
    angle: string;
    whyItFits: string;
    audienceSignal: string;
  }>;
  affiliateOpportunities: Array<{
    timestamp: string;
    title: string;
    productOrOffer: string;
    whyThisMomentFits: string;
  }>;
  sponsorSegments: Array<{
    timestamp: string;
    title: string;
    sponsorType: string;
    pitchAngle: string;
  }>;
  ctaMoments: Array<{
    timestamp: string;
    cta: string;
    rationale: string;
  }>;
  repurposingHooks: Array<{
    title: string;
    whyItCouldConvert: string;
  }>;
  risks: string[];
  nextActions: string[];
};

export type MonetizationScanOutput = {
  workflowId: "monetization-scan";
  workflowLabel: "Monetization Scan";
  model: string;
  youtubeUrl: string;
  normalizedYoutubeUrl: string;
  videoTitle: string | null;
  channelTitle: string | null;
  durationSeconds: number | null;
  clip: {
    startOffsetSeconds: number | null;
    endOffsetSeconds: number | null;
  };
  usedCustomSchema: boolean;
  analysis: MonetizationScanAnalysis;
};

function buildMonetizationScanPrompt(focus?: string): string {
  const trimmedFocus = focus?.trim();
  const focusLine = trimmedFocus
    ? `Prioritize this business angle or product category if it fits naturally: ${trimmedFocus}.`
    : "Prioritize the most realistic monetization paths that fit the audience and the actual content.";

  return [
    "Act as a YouTube monetization strategist for creators and small channel teams.",
    "Review the full video and identify realistic affiliate, sponsor, CTA, and repurposing opportunities.",
    "Be commercially useful, not generic. Prefer specific and grounded opportunities over broad marketing advice.",
    focusLine,
    "Avoid inventing products or offers that do not fit the content.",
    "If the video is weak for direct monetization, say so clearly and explain why.",
    "Use timestamps whenever a monetization angle is tied to a concrete moment in the video.",
  ].join(" ");
}

function pickMetadataSummary(metadata: MetadataToolOutput) {
  return {
    videoTitle: metadata.title ?? null,
    channelTitle: metadata.channelTitle ?? null,
    durationSeconds: metadata.durationSeconds ?? null,
  };
}

export async function runMonetizationScan(
  service: VideoAnalysisServiceLike,
  input: MonetizationScanInput,
  context: AnalysisExecutionContext
): Promise<MonetizationScanOutput> {
  const [analysisResult, metadata] = await Promise.all([
    service.analyzeShort(
      {
        youtubeUrl: input.youtubeUrl,
        analysisPrompt: buildMonetizationScanPrompt(input.focus),
        startOffsetSeconds: input.startOffsetSeconds,
        endOffsetSeconds: input.endOffsetSeconds,
        responseSchemaJson: JSON.stringify(monetizationScanSchema),
      },
      context
    ),
    service.getYouTubeMetadata({ youtubeUrl: input.youtubeUrl }, context),
  ]);

  return {
    workflowId: "monetization-scan",
    workflowLabel: "Monetization Scan",
    model: analysisResult.model,
    youtubeUrl: analysisResult.youtubeUrl,
    normalizedYoutubeUrl: analysisResult.normalizedYoutubeUrl,
    clip: {
      startOffsetSeconds: analysisResult.clip.startOffsetSeconds,
      endOffsetSeconds: analysisResult.clip.endOffsetSeconds,
    },
    usedCustomSchema: analysisResult.usedCustomSchema,
    analysis: analysisResult.analysis as MonetizationScanAnalysis,
    ...pickMetadataSummary(metadata),
  };
}
