import { useTranslation } from 'react-i18next';
import { Eye, Clock, CheckCircle2, Flame, BarChart3 } from 'lucide-react';
import { StatCard, formatWatchTime } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ErrorState,
  EmptyState,
  BingeHighlightsTable,
  MostWatchedSection,
} from '@/components/library';
import {
  CompletionDonutChart,
  HourlyDistributionChart,
  MonthlyTrendChart,
} from '@/components/charts';
import { useLibraryWatch, useLibraryCompletion, useLibraryPatterns } from '@/hooks/queries';
import { useServer } from '@/hooks/useServer';
import { getHour12 } from '@/lib/timeFormat';

function formatPeakHour(hour: number | undefined): string {
  if (hour === undefined) return '-';
  const date = new Date(2024, 0, 1, hour);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', hour12: getHour12() });
}

function formatPeakDay(day: number | undefined): string {
  if (day === undefined) return '';
  // Create a date for the given day of week (Jan 7, 2024 is a Sunday)
  const refDate = new Date(2024, 0, 7 + day);
  return refDate.toLocaleDateString(undefined, { weekday: 'long' });
}

export function LibraryWatch() {
  const { t } = useTranslation(['pages', 'common']);
  const { selectedServerId } = useServer();

  // Watch data for KPIs
  const watch = useLibraryWatch(selectedServerId, null, 1, 20);

  // Completion data by media type for donut charts
  const movieCompletion = useLibraryCompletion(selectedServerId, null, 'item', 1, 1, 'movie');
  const tvCompletion = useLibraryCompletion(selectedServerId, null, 'item', 1, 1, 'episode');

  // Patterns data for hourly/monthly charts, peak times, binge shows
  const patterns = useLibraryPatterns(selectedServerId, null, 12); // 12 weeks = ~3 months

  // Header component (used in all states)
  const header = (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold">{t('library.watch.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('library.watch.description')}</p>
      </div>
    </div>
  );

  // Show error state with retry
  if (watch.isError || patterns.isError) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState
          title={t('library.watch.failedToLoad')}
          message={
            watch.error?.message ?? patterns.error?.message ?? t('library.watch.failedToLoadDesc')
          }
          onRetry={() => {
            void watch.refetch();
            void patterns.refetch();
          }}
        />
      </div>
    );
  }

  // Show empty state if no watch data
  if (!watch.isLoading && (!watch.data?.items || watch.data.items.length === 0)) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={BarChart3}
          title={t('library.watch.noData')}
          description={t('library.watch.noDataDesc')}
        />
      </div>
    );
  }

  // Extract completion summary data for the donut charts
  const movieSummary = movieCompletion.data?.summary;
  const tvSummary = tvCompletion.data?.summary;
  const totalCompleted = (movieSummary?.completedCount ?? 0) + (tvSummary?.completedCount ?? 0);

  return (
    <div className="space-y-6">
      {header}

      {/* KPI Cards Grid - 4 columns on desktop, 2 on mobile */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={Eye}
          label={t('library.watch.watched')}
          value={`${watch.data?.summary.watchedCount ?? 0}/${watch.data?.summary.totalItems ?? 0}`}
          subValue={`${(watch.data?.summary.watchedPct ?? 0).toFixed(0)}${t('library.watch.percentWatched')}`}
          isLoading={watch.isLoading}
        />
        <StatCard
          icon={Clock}
          label={t('library.watch.totalWatchTime')}
          value={formatWatchTime(watch.data?.summary.totalWatchMs ?? 0)}
          subValue={`${(watch.data?.summary.avgWatchesPerItem ?? 0).toFixed(1)} ${t('library.watch.avgPerItem')}`}
          isLoading={watch.isLoading}
        />
        <StatCard
          icon={CheckCircle2}
          label={t('library.watch.completed')}
          value={`${totalCompleted}`}
          subValue={t('common:labels.items').toLowerCase()}
          isLoading={movieCompletion.isLoading || tvCompletion.isLoading}
        />
        <StatCard
          icon={Flame}
          label={t('library.watch.peakHour')}
          value={formatPeakHour(patterns.data?.peakTimes.peakHour)}
          subValue={formatPeakDay(patterns.data?.peakTimes.peakDayOfWeek)}
          isLoading={patterns.isLoading}
        />
      </div>

      {/* Most Watched Section with Movies/Shows Tabs */}
      <MostWatchedSection serverId={selectedServerId} />

      {/* Completion Section - Two Columns (Movies / TV) */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Left: Movies Completion */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">
              {t('common:media.movie_plural')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CompletionDonutChart
              completed={movieSummary?.completedCount ?? 0}
              inProgress={movieSummary?.inProgressCount ?? 0}
              notStarted={movieSummary?.notStartedCount ?? 0}
              isLoading={movieCompletion.isLoading}
              height={220}
            />
          </CardContent>
        </Card>

        {/* Right: TV Shows Completion */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">{t('common:media.tvShows')}</CardTitle>
          </CardHeader>
          <CardContent>
            <CompletionDonutChart
              completed={tvSummary?.completedCount ?? 0}
              inProgress={tvSummary?.inProgressCount ?? 0}
              notStarted={tvSummary?.notStartedCount ?? 0}
              isLoading={tvCompletion.isLoading}
              height={220}
            />
          </CardContent>
        </Card>
      </div>

      {/* Viewing Patterns Section - Two Columns */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Left: Hourly Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium">
                {t('library.watch.viewingHours')}
              </CardTitle>
              {patterns.data?.peakTimes.peakHour !== undefined && (
                <Badge variant="outline">
                  {t('library.watch.peak')} {formatPeakHour(patterns.data.peakTimes.peakHour)}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <HourlyDistributionChart
              data={patterns.data?.peakTimes.hourlyDistribution}
              isLoading={patterns.isLoading}
              height={220}
            />
          </CardContent>
        </Card>

        {/* Right: Monthly Trends with highlights */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium">
                {t('library.watch.monthlyTrends')}
              </CardTitle>
              {patterns.data?.seasonalTrends && (
                <div className="flex gap-2">
                  <Badge variant="success" className="text-xs">
                    {t('library.watch.busiest')} {patterns.data.seasonalTrends.busiestMonth}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {t('library.watch.quietest')} {patterns.data.seasonalTrends.quietestMonth}
                  </Badge>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <MonthlyTrendChart
              data={patterns.data?.seasonalTrends.monthlyTrends}
              isLoading={patterns.isLoading}
              height={220}
            />
          </CardContent>
        </Card>
      </div>

      {/* Binge Highlights Section - Full Width */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-medium">
                {t('library.watch.bingeHighlights')}
              </CardTitle>
              <p className="text-muted-foreground text-sm">
                {t('library.watch.bingeHighlightsDesc')}
              </p>
            </div>
            {patterns.data?.summary && (
              <div className="text-right">
                <p className="text-lg font-medium">
                  {patterns.data.summary.bingeSessionsPct.toFixed(0)}%
                </p>
                <p className="text-muted-foreground text-xs">{t('library.watch.bingeSessions')}</p>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <BingeHighlightsTable data={patterns.data?.bingeShows} isLoading={patterns.isLoading} />
        </CardContent>
      </Card>
    </div>
  );
}
