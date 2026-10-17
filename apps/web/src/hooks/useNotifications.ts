import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateNotificationSettingsInput, WhatsAppConsentInput } from '@interscale/shared';
import {
  getDeliveryStats,
  getIntegrationStatus,
  getNotificationSettings,
  getTemplateMappings,
  getUnreadCount,
  listNotificationLog,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  retryNotification,
  updateConsent,
  updateNotificationSettings,
  updateTemplateMappings,
  type NotificationCenterFilters,
  type NotificationLogFilters,
} from '../lib/notifications-api';

const CENTER_KEY = ['notifications'] as const;
const UNREAD_KEY = ['notifications', 'unread'] as const;
const SETTINGS_KEY = ['notification-settings'] as const;

export function useNotifications(filters: NotificationCenterFilters = {}) {
  return useQuery({
    queryKey: [...CENTER_KEY, { unreadOnly: filters.unreadOnly ?? false }],
    queryFn: () => listNotifications(filters),
    retry: false,
  });
}

export function useUnreadNotificationCount(enabled = true) {
  return useQuery({
    queryKey: UNREAD_KEY,
    queryFn: getUnreadCount,
    enabled,
    retry: false,
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CENTER_KEY });
      void queryClient.invalidateQueries({ queryKey: UNREAD_KEY });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CENTER_KEY });
      void queryClient.invalidateQueries({ queryKey: UNREAD_KEY });
    },
  });
}

export function useUpdateConsent() {
  return useMutation({
    mutationFn: (input: WhatsAppConsentInput) => updateConsent(input),
  });
}

export function useNotificationSettings(enabled = true) {
  return useQuery({
    queryKey: [...SETTINGS_KEY, 'config'],
    queryFn: getNotificationSettings,
    enabled,
    retry: false,
  });
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateNotificationSettingsInput) => updateNotificationSettings(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

export function useTemplateMappings(enabled = true) {
  return useQuery({
    queryKey: [...SETTINGS_KEY, 'templates'],
    queryFn: getTemplateMappings,
    enabled,
    retry: false,
  });
}

export function useUpdateTemplateMappings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mappings: { eventType: string; templateKey: string; enabled: boolean }[]) =>
      updateTemplateMappings(mappings),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

export function useDeliveryStats(enabled = true) {
  return useQuery({
    queryKey: [...SETTINGS_KEY, 'stats'],
    queryFn: getDeliveryStats,
    enabled,
    retry: false,
  });
}

export function useIntegrationStatus(enabled = true) {
  return useQuery({
    queryKey: [...SETTINGS_KEY, 'integration'],
    queryFn: getIntegrationStatus,
    enabled,
    retry: false,
  });
}

export function useNotificationLog(filters: NotificationLogFilters = {}, enabled = true) {
  return useQuery({
    queryKey: [...SETTINGS_KEY, 'log', { status: filters.status ?? '' }],
    queryFn: () => listNotificationLog(filters),
    enabled,
    retry: false,
  });
}

export function useRetryNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => retryNotification(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}
