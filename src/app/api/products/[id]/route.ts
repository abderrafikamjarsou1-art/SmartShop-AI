import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/tenant";
import { zParse, zUuid } from "@/lib/validation";
import { updateProductSchema } from "@/lib/validation/product";
import { productService } from "@/services/product-service";
import { assertSameOrigin } from "@/lib/rate-limit";
import { extractBearerToken } from "@/lib/auth-bearer";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * GET    /api/products/[id] — single product.
 * PATCH  /api/products/[id] — update.
 * DELETE /api/products/[id] — soft delete ONLY (no permanent delete for
 * the mobile client — that path stays admin-only, see productService).
 *
 * `id` is always taken from the URL, never from the body — a client
 * cannot retarget a write by smuggling a different id into the payload.
 * Tenant ownership is enforced inside productService (every lookup is
 * scoped by ctx.businessId, resolved server-side by requireRole()).
 */

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    const ctx = await requireRole("products:view");
    const { id } = await params;
    const product = await productService.getById(ctx, zParse(zUuid, id));
    return ok(product, requestId);
  } catch (error) {
    return fail(error, requestId, "GET /api/products/[id]");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireRole("products:manage");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    // The URL param is authoritative — any `id` in the body is overwritten,
    // never trusted, before it ever reaches validation or the service.
    const input = zParse(updateProductSchema, { ...body, id });
    const product = await productService.update(ctx, input);
    return ok(product, requestId);
  } catch (error) {
    return fail(error, requestId, "PATCH /api/products/[id]");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireRole("products:manage");
    const { id } = await params;
    const result = await productService.softDelete(ctx, [zParse(zUuid, id)]);
    return ok(result, requestId);
  } catch (error) {
    return fail(error, requestId, "DELETE /api/products/[id]");
  }
}
