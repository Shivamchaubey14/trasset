/**
 * Request and approval mutations (FR-14.16, FR-14.17).
 *
 * The idempotency discipline is the same as `assets/mutations.ts`: one key per
 * submission, generated when the user commits and reused for every retry of
 * *that* attempt (BE-4). A fresh key per retry would make the mechanism useless.
 *
 * **No optimistic updates here**, unlike the asset lifecycle. Approving is not
 * a local state flip: it assigns an asset, and the server may refuse with a 409
 * because somebody took that asset in the meantime — in which case the request
 * is still pending and the optimistic "Approved" would have been a lie on
 * screen. The lifecycle mutations can guess because their outcome is knowable
 * from the input; a decision's is not (see `services/requests.approve`, which
 * rolls the whole approval back when the assignment raises).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";

import { api } from "@/api";
import type { AssetRequest } from "@/api";

export function newIdempotencyKey(): string {
  return Crypto.randomUUID();
}

interface CreateInput {
  /** A specific asset, or a category when any one will do — never both. */
  assetId?: number | null;
  categoryId?: number | null;
  reason: string;
  neededBy?: string | null;
  idempotencyKey: string;
}

interface ApproveInput {
  requestId: number;
  /** Required when the request named a category; also allows a substitution. */
  assetId?: number | null;
  notes?: string;
  idempotencyKey: string;
}

interface RejectInput {
  requestId: number;
  /** The requester reads this, so the server insists on it. */
  notes: string;
  idempotencyKey: string;
}

interface CancelInput {
  requestId: number;
  idempotencyKey: string;
}

/**
 * Everything a decision invalidates.
 *
 * An approval reaches further than the request itself: it assigns an asset, so
 * the register, that asset and its history are all stale, and the requester
 * gets a notification. Invalidating narrowly here would leave the Assets tab
 * showing the asset as available right after handing it over.
 */
function useRequestMutation<TInput extends { requestId?: number }>(
  run: (input: TInput) => Promise<AssetRequest>,
  { touchesAssets = false }: { touchesAssets?: boolean } = {},
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: run,
    onSuccess(updated) {
      // Every one of these endpoints returns the full read shape — the write
      // serializers' `to_representation` hands back the record, not the fields
      // submitted — so the response can seed the detail cache directly. Keyed
      // off the *response* id rather than the input, because a create has no
      // id to send.
      if (updated?.id) {
        queryClient.setQueryData(["request", updated.id], updated);
      }
    },
    onSettled(_data, _error, input) {
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      queryClient.invalidateQueries({ queryKey: ["requestStats"] });
      if (input.requestId) {
        queryClient.invalidateQueries({ queryKey: ["request", input.requestId] });
      }
      if (touchesAssets) {
        queryClient.invalidateQueries({ queryKey: ["assets"] });
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      }
    },
  });
}

export function useCreateRequest() {
  return useRequestMutation<CreateInput & { requestId?: number }>(
    ({ assetId, categoryId, reason, neededBy, idempotencyKey }) =>
      api.post<AssetRequest>(
        "/asset-requests/",
        {
          ...(assetId ? { asset_id: assetId } : {}),
          ...(categoryId ? { category_id: categoryId } : {}),
          reason,
          // Omitted rather than sent as null — the field is optional and an
          // explicit null reads as "cleared", which is a different statement.
          ...(neededBy ? { needed_by: neededBy } : {}),
        },
        { idempotencyKey },
      ),
  );
}

export function useApproveRequest() {
  return useRequestMutation<ApproveInput>(
    ({ requestId, assetId, notes, idempotencyKey }) =>
      api.post<AssetRequest>(
        `/asset-requests/${requestId}/approve/`,
        {
          ...(assetId ? { asset_id: assetId } : {}),
          notes: notes ?? "",
        },
        { idempotencyKey },
      ),
    // An approval hands an asset over, so the register is stale too.
    { touchesAssets: true },
  );
}

export function useRejectRequest() {
  return useRequestMutation<RejectInput>(
    ({ requestId, notes, idempotencyKey }) =>
      api.post<AssetRequest>(
        `/asset-requests/${requestId}/reject/`,
        { notes },
        { idempotencyKey },
      ),
  );
}

export function useCancelRequest() {
  return useRequestMutation<CancelInput>(
    ({ requestId, idempotencyKey }) =>
      api.post<AssetRequest>(
        `/asset-requests/${requestId}/cancel/`,
        {},
        { idempotencyKey },
      ),
  );
}
