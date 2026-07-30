/**
 * One request, and the decision on it (FR-14.17).
 *
 * The approver's question is "should this person get this thing?", so the screen
 * leads with the person and the reason rather than with the record's metadata.
 *
 * **Approving a category request needs an asset chosen.** The server refuses
 * otherwise — `services/requests.approve` raises when the request named a
 * category and no asset was supplied — so the picker appears inline rather than
 * letting someone press Approve into a guaranteed error.
 *
 * **A 409 here is not a failure the approver caused.** Between raising and
 * deciding, somebody may have taken the asset; the approval then rolls back
 * whole and the request stays pending. That gets the conflict sheet, the same
 * treatment as a contested assign (§12.5), because the right next step is to
 * look again rather than to retry blindly.
 *
 * Substituting an equivalent asset on a *specific-asset* request is supported by
 * the API but not offered here: it is a judgement call made while comparing
 * inventory, which is desk work (§12.8). The phone does the common case.
 */
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, api } from "@/api";
import type { Asset, AssetRequest, Page } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import {
  Avatar,
  Button,
  Card,
  ConflictSheet,
  EmptyState,
  SkeletonRow,
  StatusPill,
  TextField,
  useToast,
} from "@/components";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { canCancel, isDecidable, stateExplanation } from "@/requests/actions";
import {
  newIdempotencyKey,
  useApproveRequest,
  useCancelRequest,
  useRejectRequest,
} from "@/requests/mutations";
import { type RequestStatus, fonts, fontSizes, radius, spacing, useTheme } from "@/theme";

/** Mirrors `RequestRejectSerializer.validate_notes`. */
const MIN_REJECT_REASON = 5;

export function RequestDetailScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const route = useRoute<RouteProp<RootStackParamList, "Request">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { id } = route.params;

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [chosenAsset, setChosenAsset] = useState<Asset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  // One key per decision, so a retry after a timeout does not decide twice.
  const [approveKey] = useState(newIdempotencyKey);
  const [rejectKey] = useState(newIdempotencyKey);
  const [cancelKey] = useState(newIdempotencyKey);

  const requestQuery = useQuery({
    queryKey: ["request", id],
    queryFn: () => api.get<AssetRequest>(`/asset-requests/${id}/`),
    // The list already fetched this row, so detail paints immediately and then
    // refreshes — the same trick the asset screen uses after a scan.
    initialData: route.params.request,
  });

  const approve = useApproveRequest();
  const reject = useRejectRequest();
  const cancel = useCancelRequest();

  const request = requestQuery.data;
  const status = (request?.status ?? "pending") as RequestStatus;

  // A category request needs an asset chosen before it can be approved; a
  // specific-asset one already names its own.
  const needsAssetChoice = Boolean(request && !request.asset && request.category);

  const available = useQuery({
    queryKey: ["assets", "available", (request?.category as { id?: number } | null)?.id],
    queryFn: () =>
      api.get<Page<Asset>>("/assets/", {
        page_size: 20,
        status: "available",
        ...(((request?.category as { id?: number } | null)?.id)
          ? { category: (request!.category as { id: number }).id }
          : {}),
      }),
    enabled: needsAssetChoice && isDecidable(status, user?.role_name as string | undefined),
  });

  const candidates = useMemo(() => available.data?.results ?? [], [available.data]);

  if (requestQuery.isLoading && !request) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.md, gap: spacing.sm }}>
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  if (!request) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center" }}>
        <EmptyState
          tone="error"
          title="Could not load this request"
          message="It may have been removed, or you may be offline."
          actionLabel="Try again"
          onAction={requestQuery.refetch}
        />
      </View>
    );
  }

  const requester = request.requester as
    | { id?: number; full_name?: string; email?: string; avatar?: string | null; department_name?: string }
    | null;
  const decidedBy = request.decided_by as { full_name?: string } | null;
  const fulfilled = request.fulfilled_asset as { asset_tag?: string; name?: string } | null;

  const mayDecide = isDecidable(status, user?.role_name as string | undefined);
  const mayCancel = canCancel(status, requester?.id, user?.id);
  const explanation = stateExplanation(status);

  function onDecisionError(err: unknown, fallback: string) {
    if (err instanceof ApiError && err.isConflict) {
      // Somebody moved the world — its own path through the UI.
      setConflict(err.message);
      return;
    }
    setError(err instanceof ApiError ? err.message : fallback);
  }

  function submitApprove() {
    if (needsAssetChoice && !chosenAsset) {
      setError("Choose which asset to hand over.");
      return;
    }
    setError(null);
    approve.mutate(
      { requestId: id, assetId: chosenAsset?.id ?? null, idempotencyKey: approveKey },
      {
        onSuccess(updated) {
          const tag =
            (updated.fulfilled_asset as { asset_tag?: string } | null)?.asset_tag ??
            chosenAsset?.asset_tag;
          toast.success(
            tag
              ? `Approved — ${tag} assigned to ${requester?.full_name ?? "the requester"}`
              : "Request approved",
          );
          navigation.goBack();
        },
        onError: (err) => onDecisionError(err, "Could not approve this request."),
      },
    );
  }

  function submitReject() {
    if (reason.trim().length < MIN_REJECT_REASON) {
      setError("Give the requester a reason, however brief.");
      return;
    }
    setError(null);
    reject.mutate(
      { requestId: id, notes: reason.trim(), idempotencyKey: rejectKey },
      {
        onSuccess() {
          toast.success("Request rejected. The requester has been told.");
          navigation.goBack();
        },
        onError: (err) => onDecisionError(err, "Could not reject this request."),
      },
    );
  }

  function submitCancel() {
    setError(null);
    cancel.mutate(
      { requestId: id, idempotencyKey: cancelKey },
      {
        onSuccess() {
          toast.success("Request withdrawn.");
          navigation.goBack();
        },
        onError: (err) => onDecisionError(err, "Could not withdraw this request."),
      },
    );
  }

  const busy = approve.isPending || reject.isPending || cancel.isPending;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
          gap: spacing.md,
        }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={requestQuery.isFetching && !requestQuery.isLoading}
            onRefresh={requestQuery.refetch}
            tintColor={colors.primary}
          />
        }
      >
        {/* The person and the ask, first — that is the decision. */}
        <View style={{ gap: spacing.sm }}>
          <StatusPill status={status} label={request.status_label} />
          <Text style={[styles.target, { color: colors.text }]}>
            {request.target_label || "An asset"}
          </Text>
        </View>

        {requester ? (
          <Card>
            <View style={styles.person}>
              <Avatar name={requester.full_name} uri={requester.avatar} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {requester.full_name}
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                  {[requester.email, requester.department_name].filter(Boolean).join(" · ")}
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        <Card>
          <View style={{ gap: spacing.xs }}>
            <Text style={[styles.label, { color: colors.textMuted }]}>REASON</Text>
            <Text style={[styles.body, { color: colors.text }]}>{request.reason}</Text>
          </View>
        </Card>

        {request.needed_by ? (
          <Row label="Needed by" value={formatDate(request.needed_by)} />
        ) : null}
        <Row label="Raised" value={formatDate(request.created_at)} />

        {request.decided_at ? (
          <Row
            label={status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : "Decided"}
            value={`${formatDate(request.decided_at)}${decidedBy?.full_name ? ` by ${decidedBy.full_name}` : ""}`}
          />
        ) : null}

        {fulfilled?.asset_tag ? (
          <Row label="Handed over" value={`${fulfilled.asset_tag} — ${fulfilled.name ?? ""}`.trim()} />
        ) : null}

        {request.decision_notes ? (
          <Card>
            <View style={{ gap: spacing.xs }}>
              <Text style={[styles.label, { color: colors.textMuted }]}>
                {status === "rejected" ? "WHY IT WAS TURNED DOWN" : "DECISION NOTES"}
              </Text>
              <Text style={[styles.body, { color: colors.text }]}>{request.decision_notes}</Text>
            </View>
          </Card>
        ) : null}

        {explanation ? (
          <Text style={[styles.explanation, { color: colors.textMuted }]}>{explanation}</Text>
        ) : null}

        {/* ---------------- decision ---------------- */}
        {mayDecide ? (
          <View style={{ gap: spacing.md, paddingTop: spacing.sm }}>
            {needsAssetChoice ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={[styles.label, { color: colors.textMuted }]}>
                  WHICH ASSET WILL YOU HAND OVER?
                </Text>
                {candidates.length ? (
                  candidates.map((asset) => (
                    <Pressable
                      key={asset.id}
                      onPress={() => {
                        setChosenAsset(chosenAsset?.id === asset.id ? null : asset);
                        setError(null);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: chosenAsset?.id === asset.id }}
                      style={[
                        styles.candidate,
                        {
                          backgroundColor: colors.surface,
                          borderColor:
                            chosenAsset?.id === asset.id ? colors.primary : colors.border,
                          borderWidth: chosenAsset?.id === asset.id ? 2 : StyleSheet.hairlineWidth,
                        },
                      ]}
                    >
                      <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                        {asset.name}
                      </Text>
                      <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                        {asset.asset_tag}
                      </Text>
                    </Pressable>
                  ))
                ) : available.isLoading ? (
                  <SkeletonRow />
                ) : (
                  <Text style={[styles.meta, { color: colors.textMuted }]}>
                    Nothing available in that category right now. Rejecting with a
                    reason is kinder than leaving it pending.
                  </Text>
                )}
              </View>
            ) : null}

            {rejecting ? (
              <TextField
                label="Why are you turning it down?"
                value={reason}
                onChangeText={(value) => {
                  setReason(value);
                  setError(null);
                }}
                placeholder="No spare laptops until the next order arrives."
                multiline
                numberOfLines={3}
                style={{ minHeight: 76, textAlignVertical: "top" }}
                autoFocus
              />
            ) : null}

            {error ? (
              <Text
                style={[styles.error, { color: colors.danger }]}
                accessibilityLiveRegion="assertive"
              >
                {error}
              </Text>
            ) : null}

            {rejecting ? (
              <View style={{ gap: spacing.sm }}>
                <Button
                  label="Reject the request"
                  onPress={submitReject}
                  loading={reject.isPending}
                />
                <Button
                  label="Back"
                  variant="ghost"
                  onPress={() => {
                    setRejecting(false);
                    setReason("");
                    setError(null);
                  }}
                />
              </View>
            ) : (
              <View style={{ gap: spacing.sm }}>
                <Button
                  label="Approve and hand over"
                  onPress={submitApprove}
                  loading={approve.isPending}
                  disabled={busy || (needsAssetChoice && !candidates.length)}
                />
                <Button
                  label="Reject"
                  variant="secondary"
                  onPress={() => {
                    setRejecting(true);
                    setError(null);
                  }}
                  disabled={busy}
                />
                {/* §12.5: a decision is not queueable, so say so rather than
                    letting someone believe it will apply later. */}
                <Text style={[styles.note, { color: colors.textMuted }]}>
                  Decisions need a connection — they are not queued offline.
                </Text>
              </View>
            )}
          </View>
        ) : mayCancel ? (
          <View style={{ gap: spacing.sm, paddingTop: spacing.sm }}>
            {error ? (
              <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
            ) : null}
            <Button
              label="Withdraw this request"
              variant="secondary"
              onPress={submitCancel}
              loading={cancel.isPending}
            />
          </View>
        ) : null}
      </ScrollView>

      <ConflictSheet
        visible={Boolean(conflict)}
        message={conflict ?? ""}
        onResolve={() => {
          setConflict(null);
          // Back to the list, which refetches. Leaving them on a decision screen
          // for a request that has moved on would invite a second wrong tap.
          navigation.goBack();
        }}
      />
    </KeyboardAvoidingView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.meta, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.text }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const styles = StyleSheet.create({
  target: { fontFamily: fonts.head, fontSize: fontSizes.h2 },
  person: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  name: { fontFamily: fonts.bodySemi, fontSize: fontSizes.body },
  meta: { fontFamily: fonts.body, fontSize: 12 },
  label: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.2 },
  body: { fontFamily: fonts.body, fontSize: fontSizes.body, lineHeight: fontSizes.body * 1.5 },
  explanation: { fontFamily: fonts.body, fontSize: fontSizes.small, lineHeight: fontSizes.small * 1.5 },
  error: { fontFamily: fonts.body, fontSize: fontSizes.small },
  note: { fontFamily: fonts.body, fontSize: 12, textAlign: "center" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  detailValue: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.small, flexShrink: 1, textAlign: "right" },
  candidate: { borderRadius: radius.md, padding: spacing.md, gap: 2 },
});
