import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import type { NotificationChannelRouting, NotificationEventType } from '@tracearr/shared';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useChannelRouting, useUpdateChannelRouting } from '@/hooks/queries';

// Order of events in the table (security first, then streams, then server)
// concurrent_streams excluded - it's a rule type, violations cover it
const EVENT_ORDER: NotificationEventType[] = [
  'violation_detected',
  'new_device',
  'trust_score_changed',
  'stream_started',
  'stream_stopped',
  'server_down',
  'server_up',
];

interface NotificationRoutingMatrixProps {
  discordConfigured: boolean;
  webhookConfigured: boolean;
}

export function NotificationRoutingMatrix({
  discordConfigured,
  webhookConfigured,
}: NotificationRoutingMatrixProps) {
  const { t } = useTranslation(['settings', 'notifications', 'common']);
  const { data: routingData, isLoading } = useChannelRouting();
  const updateRouting = useUpdateChannelRouting();

  // Display names and descriptions for event types, translated
  const EVENT_CONFIG = useMemo(
    (): Partial<Record<NotificationEventType, { name: string; description: string }>> => ({
      violation_detected: {
        name: t('notifications:settings.violationDetected'),
        description: t('notifications:settings.violationDetectedDesc'),
      },
      new_device: {
        name: t('notifications:settings.newDevice'),
        description: t('notifications:settings.newDeviceDesc'),
      },
      trust_score_changed: {
        name: t('notifications:settings.trustScoreChanged'),
        description: t('notifications:settings.trustScoreChangedDesc'),
      },
      stream_started: {
        name: t('notifications:settings.streamStarted'),
        description: t('notifications:settings.streamStartedDesc'),
      },
      stream_stopped: {
        name: t('notifications:settings.streamStopped'),
        description: t('notifications:settings.streamStoppedDesc'),
      },
      server_down: {
        name: t('notifications:settings.serverDown'),
        description: t('notifications:settings.serverDownDesc'),
      },
      server_up: {
        name: t('notifications:settings.serverUp'),
        description: t('notifications:settings.serverUpDesc'),
      },
    }),
    [t]
  );

  // Build a map for quick lookup
  const routingMap = new Map<NotificationEventType, NotificationChannelRouting>();
  routingData?.forEach((r) => routingMap.set(r.eventType, r));

  const handleToggle = (
    eventType: NotificationEventType,
    channel: 'discord' | 'webhook' | 'webToast',
    checked: boolean
  ) => {
    updateRouting.mutate({
      eventType,
      ...(channel === 'discord' && { discordEnabled: checked }),
      ...(channel === 'webhook' && { webhookEnabled: checked }),
      ...(channel === 'webToast' && { webToastEnabled: checked }),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {EVENT_ORDER.map((eventType) => (
          <Skeleton key={eventType} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Table */}
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="px-4 py-3">{t('notifications.routing.event')}</TableHead>
                <TableHead className="w-24 px-4 py-3 text-center">
                  {t('notifications.routing.web')}
                </TableHead>
                {discordConfigured && (
                  <TableHead className="w-24 px-4 py-3 text-center">
                    {t('notifications.routing.discord')}
                  </TableHead>
                )}
                {webhookConfigured && (
                  <TableHead className="w-24 px-4 py-3 text-center">
                    {t('notifications.routing.webhook')}
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {EVENT_ORDER.map((eventType) => {
                const routing = routingMap.get(eventType);
                const config = EVENT_CONFIG[eventType];
                if (!config) return null;

                return (
                  <TableRow key={eventType}>
                    <TableCell className="px-4 py-3">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="border-muted-foreground/50 cursor-help border-b border-dotted text-sm">
                            {config.name}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <p>{config.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-center">
                      <Checkbox
                        checked={routing?.webToastEnabled ?? true}
                        onCheckedChange={(checked) =>
                          handleToggle(eventType, 'webToast', checked === true)
                        }
                        disabled={updateRouting.isPending}
                      />
                    </TableCell>
                    {discordConfigured && (
                      <TableCell className="px-4 py-3 text-center">
                        <Checkbox
                          checked={routing?.discordEnabled ?? false}
                          onCheckedChange={(checked) =>
                            handleToggle(eventType, 'discord', checked === true)
                          }
                          disabled={updateRouting.isPending}
                        />
                      </TableCell>
                    )}
                    {webhookConfigured && (
                      <TableCell className="px-4 py-3 text-center">
                        <Checkbox
                          checked={routing?.webhookEnabled ?? false}
                          onCheckedChange={(checked) =>
                            handleToggle(eventType, 'webhook', checked === true)
                          }
                          disabled={updateRouting.isPending}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Info about notification channels */}
        <div className="text-muted-foreground flex items-start gap-2 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>{t('notifications.routing.web')}</strong>{' '}
            {t('notifications.routing.webToastNote')} {t('notifications.routing.webNote')}
          </span>
        </div>
      </div>
    </TooltipProvider>
  );
}
