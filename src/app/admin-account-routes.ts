import express, { type Express, type Request } from "express";

import {
  getRemoteAccountEntitlements,
  isRemoteAccountPlan,
  type RemoteAccount,
  type RemoteAccessStore,
  type UsageEventStore,
} from "../auth-billing/index.js";

type AdminAccountRouteOptions = {
  remoteAccessStore: RemoteAccessStore;
  usageEventStore: UsageEventStore;
};

type AdminAccountLookupInput = {
  accountId?: unknown;
  issuer?: unknown;
  subject?: unknown;
};

function sanitizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readFirstQueryValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function resolveAdminAccountId(input: AdminAccountLookupInput): string | null {
  const accountId = sanitizeString(input.accountId);
  if (accountId) {
    return accountId;
  }

  const issuer = sanitizeString(input.issuer);
  const subject = sanitizeString(input.subject);
  if (!issuer || !subject) {
    return null;
  }

  return `${issuer}:${subject}`;
}

function resolveAccountLookupFromRequest(request: Request): string | null {
  if (request.method === "GET") {
    return resolveAdminAccountId({
      accountId: readFirstQueryValue(request.query.accountId as string | string[] | undefined),
      issuer: readFirstQueryValue(request.query.issuer as string | string[] | undefined),
      subject: readFirstQueryValue(request.query.subject as string | string[] | undefined),
    });
  }

  const body =
    request.body && typeof request.body === "object" && !Array.isArray(request.body)
      ? (request.body as Record<string, unknown>)
      : {};
  return resolveAdminAccountId(body);
}

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.floor(value);
}

function createAdminAccountResponse(account: RemoteAccount) {
  return {
    ...account,
    entitlements: getRemoteAccountEntitlements(account.plan),
  };
}

export function registerAdminAccountRoutes(
  app: Express,
  options: AdminAccountRouteOptions
): void {
  const jsonParser = express.json({ limit: "32kb" });

  app.get("/admin/api/account", async (request, response) => {
    const accountId = resolveAccountLookupFromRequest(request);
    if (!accountId) {
      response.status(400).json({
        error: "Provide accountId or both issuer and subject.",
      });
      return;
    }

    const account = await options.remoteAccessStore.getAccount(accountId);
    if (!account) {
      response.status(404).json({
        error: "Account not found.",
        accountId,
      });
      return;
    }

    response.json({
      account: createAdminAccountResponse(account),
    });
  });

  app.post("/admin/api/account/plan", jsonParser, async (request, response) => {
    const accountId = resolveAccountLookupFromRequest(request);
    if (!accountId) {
      response.status(400).json({
        error: "Provide accountId or both issuer and subject.",
      });
      return;
    }

    const body =
      request.body && typeof request.body === "object" && !Array.isArray(request.body)
        ? (request.body as Record<string, unknown>)
        : {};
    const plan = body.plan;
    if (!isRemoteAccountPlan(plan)) {
      response.status(400).json({
        error: 'Provide a valid plan: "trial", "builder", "pro", or "business".',
      });
      return;
    }

    const existing = await options.remoteAccessStore.getAccount(accountId);
    if (!existing) {
      response.status(404).json({
        error: "Account not found.",
        accountId,
      });
      return;
    }

    const updated = await options.remoteAccessStore.setAccountPlan(accountId, plan);
    if (!updated) {
      response.status(500).json({
        error: "Failed to update account plan.",
        accountId,
      });
      return;
    }

    if (existing.plan !== updated.plan) {
      await options.usageEventStore.append({
        accountId,
        kind: "account.plan_changed",
        tool: "admin",
        creditsBalance: updated.creditBalance,
        metadata: {
          source: "admin_api",
          previousPlan: existing.plan,
          nextPlan: updated.plan,
        },
      });
    }

    response.json({
      account: createAdminAccountResponse(updated),
    });
  });

  app.post("/admin/api/account/grant-credits", jsonParser, async (request, response) => {
    const accountId = resolveAccountLookupFromRequest(request);
    if (!accountId) {
      response.status(400).json({
        error: "Provide accountId or both issuer and subject.",
      });
      return;
    }

    const body =
      request.body && typeof request.body === "object" && !Array.isArray(request.body)
        ? (request.body as Record<string, unknown>)
        : {};
    const credits = normalizePositiveInteger(body.credits);
    if (!credits) {
      response.status(400).json({
        error: "Provide credits as a positive number.",
      });
      return;
    }

    const updated = await options.remoteAccessStore.grantAccountCredits(accountId, credits);
    if (!updated) {
      response.status(404).json({
        error: "Account not found.",
        accountId,
      });
      return;
    }

    await options.usageEventStore.append({
      accountId,
      kind: "credits.granted",
      tool: "admin",
      creditsDelta: credits,
      creditsBalance: updated.creditBalance,
      metadata: {
        source: "admin_api",
      },
    });

    response.json({
      account: createAdminAccountResponse(updated),
      grantedCredits: credits,
    });
  });
}
