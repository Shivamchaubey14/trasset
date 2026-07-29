/**
 * Toasts.
 *
 * The web puts these top-right and auto-dismisses (SRS §7.4). On a phone they
 * belong at the *bottom*, within thumb reach and clear of the notch — but
 * above the tab bar, or they cover the navigation the user is about to press.
 *
 * Errors do not auto-dismiss. A success can be missed harmlessly; a failure
 * the user never saw is how work gets silently lost, which FR-14.27 exists to
 * prevent.
 */
import { Ionicons } from "@expo/vector-icons";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, fontSizes, radius, spacing, useTheme } from "@/theme";

export type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastValue {
  show(message: string, tone?: ToastTone): void;
  success(message: string): void;
  error(message: string): void;
}

const ToastContext = createContext<ToastValue | null>(null);

const ICONS: Record<ToastTone, React.ComponentProps<typeof Ionicons>["name"]> = {
  success: "checkmark-circle",
  error: "alert-circle",
  info: "information-circle",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, tone, message }]);

      // Errors stay until dismissed — see the note at the top of the file.
      if (tone !== "error") {
        setTimeout(() => dismiss(id), 3200);
      }
    },
    [dismiss],
  );

  const value = useMemo<ToastValue>(
    () => ({
      show,
      success: (message: string) => show(message, "success"),
      error: (message: string) => show(message, "error"),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastHost({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  const insets = useSafeAreaInsets();
  if (!toasts.length) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { bottom: insets.bottom + 76 }]}
    >
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </View>
  );
}

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { colors } = useTheme();
  const enter = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [enter]);

  const tint =
    toast.tone === "success"
      ? colors.primary
      : toast.tone === "error"
        ? colors.danger
        : colors.ink;

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          backgroundColor: colors.surface,
          borderColor: tint,
          opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
          ],
        },
      ]}
      accessibilityLiveRegion={toast.tone === "error" ? "assertive" : "polite"}
    >
      <Ionicons name={ICONS[toast.tone]} size={18} color={tint} />
      <Text style={[styles.message, { color: colors.text }]}>{toast.message}</Text>
      <Pressable
        onPress={onDismiss}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </Pressable>
    </Animated.View>
  );
}

export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside <ToastProvider>");
  return value;
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: spacing.md, right: spacing.md, gap: spacing.sm },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  message: { flex: 1, fontFamily: fonts.body, fontSize: fontSizes.small, lineHeight: 19 },
});
