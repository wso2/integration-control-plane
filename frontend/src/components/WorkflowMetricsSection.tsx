/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { Card, CardContent, Grid, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@wso2/oxygen-ui';
import { LineChart } from '@wso2/oxygen-ui-charts-react';
import { useMemo, type JSX } from 'react';
import { useWorkflowMetrics, type MetricsRequest, type WorkflowMetricEntry } from '../api/metrics';

// Workflow metrics for the metrics page: runs, activities and task decisions from the workflow module's samples.
// Renders nothing for an integration that has none.

interface WorkflowMetricsSectionProps {
  request: MetricsRequest | null;
  getTimeRange: () => { startTime: string; endTime: string };
  // Formats a bucket's ISO timestamp for the x axis, as the page's other charts do.
  makeLabel: (iso: string) => string;
  // Bumped by the page's Refresh action so this section refetches with the rest of the page.
  refreshKey: number;
}

const LINE_OPTS = { dot: false, connectNulls: true, type: 'linear' as const };
const RUN_LINES = [
  { dataKey: 'started', name: 'Started', stroke: '#2196f3' },
  { dataKey: 'completed', name: 'Completed', stroke: '#4caf50' },
  { dataKey: 'failed', name: 'Failed', stroke: '#d32f2f' },
] as const;

function sum(ts: Record<string, number>): number {
  return Object.values(ts).reduce((a, b) => a + b, 0);
}

// A duration readable at any scale: runs take milliseconds, or days when waiting on a person.
function formatDuration(seconds: number): string {
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  if (seconds < 120) return `${seconds.toFixed(1)} s`;
  if (seconds < 7200) return `${(seconds / 60).toFixed(1)} min`;
  if (seconds < 172800) return `${(seconds / 3600).toFixed(1)} h`;
  const days = Math.floor(seconds / 86400);
  const hours = Math.round((seconds - days * 86400) / 3600);
  return `${days}d ${hours}h`;
}

// Adds one series' per-interval counts into `into`, keyed by timestamp.
function addInto(into: Record<string, number>, ts: Record<string, number>): void {
  for (const [k, v] of Object.entries(ts)) into[k] = (into[k] ?? 0) + v;
}

// The latest interval with a value, as [timestamp, value]; null when none.
function latestNonZero(ts: Record<string, number>): [string, number] | null {
  const keys = Object.keys(ts).sort();
  for (let i = keys.length - 1; i >= 0; i--) {
    if (ts[keys[i]] > 0) return [keys[i], ts[keys[i]]];
  }
  return null;
}

interface ActivityRow {
  activity: string;
  attempts: number;
  failures: number;
  avgMs: number;
}

interface DecisionRow {
  task: string;
  kind: string;
  accepted: number;
  denied: number;
}

interface AgentStepRow {
  step: string;
  name: string;
  count: number;
  failures: number;
  avgSeconds: number;
}

const AGENT_STEP_LABELS: Record<string, string> = {
  'agent.model_called': 'Model call',
  'agent.tool_called': 'Tool call',
  'agent.event_received': 'Event wait',
  'agent.slept': 'Sleep',
  'agent.task_awaited': 'Human task',
  'agent.tool_reviewed': 'Tool review',
};

const CONTROL_LABELS: Record<string, string> = {
  'workflow.suspended': 'Suspended',
  'workflow.resumed': 'Resumed',
  'workflow.terminated': 'Terminated',
  'workflow.cancelled': 'Cancelled',
};

// The module writes `none` into a tag that does not apply to a sample, so every sample carries every key.
const tagValue = (tags: Record<string, string>, ...keys: string[]): string => keys.map((k) => tags[k]).find((v) => v && v !== 'none') ?? '';

function aggregateRuns(runs: WorkflowMetricEntry[]) {
  const started: Record<string, number> = {};
  const completed: Record<string, number> = {};
  const failed: Record<string, number> = {};
  // "Latest" means the value at the newest interval across every closed-run series,
  // not the largest value anywhere in the range.
  let latestP95 = 0;
  let latestP95At = '';
  for (const r of runs) {
    // A human task or review runs as a child workflow of its own; its lifecycle is a task's, not a run's.
    if (tagValue(r.tags, 'task_kind')) continue;
    if (r.sample === 'workflow.started') addInto(started, r.count.timeSeriesData);
    if (r.sample === 'workflow.closed') {
      addInto(r.tags.outcome === 'failure' ? failed : completed, r.count.timeSeriesData);
      const latest = latestNonZero(r.duration_seconds_percentile_95.timeSeriesData);
      if (latest && (latest[0] > latestP95At || (latest[0] === latestP95At && latest[1] > latestP95))) {
        [latestP95At, latestP95] = latest;
      }
    }
  }
  const timestamps = Array.from(new Set([...Object.keys(started), ...Object.keys(completed), ...Object.keys(failed)])).sort();
  const chart = timestamps.map((ts) => ({ ts, started: started[ts] ?? 0, completed: completed[ts] ?? 0, failed: failed[ts] ?? 0 }));
  const totalStarted = sum(started);
  const totalCompleted = sum(completed);
  const totalFailed = sum(failed);
  const closed = totalCompleted + totalFailed;
  return { chart, totalStarted, totalCompleted, totalFailed, failurePct: closed > 0 ? (totalFailed / closed) * 100 : 0, latestP95 };
}

function aggregateActivities(activities: WorkflowMetricEntry[]): ActivityRow[] {
  const rows: Record<string, ActivityRow & { durationWeighted: number }> = {};
  for (const a of activities) {
    const key = a.tags.activity_type ?? 'unknown';
    const row = (rows[key] ??= { activity: key, attempts: 0, failures: 0, avgMs: 0, durationWeighted: 0 });
    const n = sum(a.count.timeSeriesData);
    row.attempts += n;
    if (a.tags.outcome === 'failure') row.failures += n;
    // Weight each interval's mean by its count so the row's mean is the true mean.
    for (const [ts, c] of Object.entries(a.count.timeSeriesData)) {
      row.durationWeighted += (a.duration_seconds_avg.timeSeriesData[ts] ?? 0) * c;
    }
  }
  return Object.values(rows)
    .map((r) => ({ activity: r.activity, attempts: r.attempts, failures: r.failures, avgMs: r.attempts > 0 ? (r.durationWeighted / r.attempts) * 1000 : 0 }))
    .sort((x, y) => y.failures - x.failures || y.attempts - x.attempts);
}

// One row per task. A decision refused before any task was resolved (unknown id, already decided,
// wrong role) names no task; those are counted apart rather than shown as a task called "none".
function aggregateDecisions(decisions: WorkflowMetricEntry[]): { rows: DecisionRow[]; unresolvedRefusals: number } {
  const rows: Record<string, DecisionRow> = {};
  let unresolvedRefusals = 0;
  for (const d of decisions) {
    const n = sum(d.count.timeSeriesData);
    const task = tagValue(d.tags, 'task_name');
    if (!task) {
      unresolvedRefusals += n;
      continue;
    }
    const row = (rows[task] ??= { task, kind: tagValue(d.tags, 'task_kind'), accepted: 0, denied: 0 });
    if (d.tags.outcome === 'failure') row.denied += n;
    else row.accepted += n;
  }
  return { rows: Object.values(rows).sort((x, y) => y.accepted + y.denied - (x.accepted + x.denied)), unresolvedRefusals };
}

// One row per step kind and the thing it acted on: the tool, the event, the task, or the model activity.
function aggregateAgentSteps(steps: WorkflowMetricEntry[]): AgentStepRow[] {
  const rows: Record<string, AgentStepRow & { durationWeighted: number }> = {};
  for (const s of steps) {
    const name = tagValue(s.tags, 'tool_name', 'data_name', 'task_name', 'activity_type');
    const key = `${s.sample}|${name}`;
    const row = (rows[key] ??= { step: AGENT_STEP_LABELS[s.sample] ?? s.sample, name, count: 0, failures: 0, avgSeconds: 0, durationWeighted: 0 });
    const n = sum(s.count.timeSeriesData);
    row.count += n;
    if (s.tags.outcome === 'failure') row.failures += n;
    for (const [ts, c] of Object.entries(s.count.timeSeriesData)) {
      row.durationWeighted += (s.duration_seconds_avg.timeSeriesData[ts] ?? 0) * c;
    }
  }
  return Object.values(rows)
    .map((r) => ({ step: r.step, name: r.name, count: r.count, failures: r.failures, avgSeconds: r.count > 0 ? r.durationWeighted / r.count : 0 }))
    .sort((x, y) => y.failures - x.failures || y.count - x.count);
}

// Control operations, accepted ones only: a refused suspend never touched a run.
function aggregateControls(controls: WorkflowMetricEntry[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const c of controls) {
    if (c.tags.outcome === 'failure') continue;
    totals[c.sample] = (totals[c.sample] ?? 0) + sum(c.count.timeSeriesData);
  }
  return totals;
}

function StatCard({ title, value, color }: { title: string; value: string; color?: string }): JSX.Element {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {title}
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 700, mt: 1, color }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function WorkflowMetricsSection({ request, getTimeRange, makeLabel, refreshKey }: WorkflowMetricsSectionProps): JSX.Element | null {
  const { data } = useWorkflowMetrics(request, getTimeRange, refreshKey);

  const runs = useMemo(() => aggregateRuns(data?.runs ?? []), [data]);
  const activities = useMemo(() => aggregateActivities(data?.activities ?? []), [data]);
  const { rows: decisions, unresolvedRefusals } = useMemo(() => aggregateDecisions(data?.decisions ?? []), [data]);
  const agentSteps = useMemo(() => aggregateAgentSteps(data?.agentSteps ?? []), [data]);
  const controls = useMemo(() => aggregateControls(data?.controls ?? []), [data]);
  const runChart = useMemo(() => runs.chart.map((p) => ({ ...p, label: makeLabel(p.ts) })), [runs.chart, makeLabel]);

  const hasAnything = (data?.runs.length ?? 0) + (data?.activities.length ?? 0) + (data?.decisions.length ?? 0) + (data?.dataEvents.length ?? 0) + (data?.agentSteps?.length ?? 0) + (data?.controls?.length ?? 0) > 0;
  const controlSummary = Object.entries(CONTROL_LABELS)
    .filter(([sample]) => (controls[sample] ?? 0) > 0)
    .map(([sample, label]) => `${label} ${controls[sample].toLocaleString()}`)
    .join(' · ');
  // A failed or absent workflow-metrics call must never take the HTTP metrics down with it: say nothing.
  if (!data || !hasAnything) return null;

  // The same label density as the page's other charts (~5 ticks), or long date+time
  // labels collide on wide ranges.
  const xAxisInterval = Math.max(0, Math.ceil((runChart.length || 1) / 5) - 1);

  return (
    <>
      <Typography variant="h5" sx={{ mt: 2, mb: 2 }}>
        Workflows
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard title="Runs Started" value={runs.totalStarted.toLocaleString()} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard title="Runs Completed" value={runs.totalCompleted.toLocaleString()} color="success.main" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard title="Runs Failed" value={`${runs.totalFailed.toLocaleString()} (${runs.failurePct.toFixed(1)}%)`} color="error.main" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard title="Run Duration 95th Percentile (Latest)" value={formatDuration(runs.latestP95)} />
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Runs Per Interval
              </Typography>
              <LineChart
                data={runChart}
                xAxisDataKey="label"
                height={300}
                legend={{ show: true }}
                grid={{ show: true, strokeDasharray: '3 3' }}
                xAxis={{ interval: xAxisInterval }}
                margin={{ bottom: 20 }}
                lines={RUN_LINES.map((l) => ({ ...l, ...LINE_OPTS }))}
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Activities
              </Typography>
              {activities.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No activity attempts in this window.
                </Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Activity</TableCell>
                        <TableCell align="right">Attempts</TableCell>
                        <TableCell align="right">Failures</TableCell>
                        <TableCell align="right">Avg (ms)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {activities.map((row) => (
                        <TableRow key={row.activity}>
                          <TableCell>{row.activity}</TableCell>
                          <TableCell align="right">{row.attempts.toLocaleString()}</TableCell>
                          <TableCell align="right" sx={{ color: row.failures > 0 ? 'error.main' : undefined }}>
                            {row.failures.toLocaleString()}
                          </TableCell>
                          <TableCell align="right">{row.avgMs.toFixed(0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {(decisions.length > 0 || unresolvedRefusals > 0 || agentSteps.length > 0 || controlSummary) && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {agentSteps.length > 0 && (
            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 1 }}>
                    AI Agent Steps
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Step</TableCell>
                          <TableCell>Name</TableCell>
                          <TableCell align="right">Count</TableCell>
                          <TableCell align="right">Failures</TableCell>
                          <TableCell align="right">Avg</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {agentSteps.map((row) => (
                          <TableRow key={`${row.step}|${row.name}`}>
                            <TableCell>{row.step}</TableCell>
                            <TableCell>{row.name}</TableCell>
                            <TableCell align="right">{row.count.toLocaleString()}</TableCell>
                            <TableCell align="right" sx={{ color: row.failures > 0 ? 'error.main' : undefined }}>
                              {row.failures.toLocaleString()}
                            </TableCell>
                            <TableCell align="right">{formatDuration(row.avgSeconds)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  {controlSummary && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                      Control operations: {controlSummary}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          )}
          {(decisions.length > 0 || unresolvedRefusals > 0) && (
            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 1 }}>
                    Human Decisions
                  </Typography>
                  {decisions.length > 0 && (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Task</TableCell>
                            <TableCell>Kind</TableCell>
                            <TableCell align="right">Accepted</TableCell>
                            <TableCell align="right">Denied</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {decisions.map((row) => (
                            <TableRow key={row.task}>
                              <TableCell>{row.task}</TableCell>
                              <TableCell>{row.kind === 'REVIEW_ACTIVITY' ? 'Review' : 'Human task'}</TableCell>
                              <TableCell align="right">{row.accepted.toLocaleString()}</TableCell>
                              <TableCell align="right" sx={{ color: row.denied > 0 ? 'error.main' : undefined }}>
                                {row.denied.toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                  {unresolvedRefusals > 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                      {unresolvedRefusals.toLocaleString()} {unresolvedRefusals === 1 ? 'decision was' : 'decisions were'} refused before a task was resolved (unknown task, already decided, or an unauthorized role).
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          )}
          {decisions.length === 0 && unresolvedRefusals === 0 && agentSteps.length === 0 && controlSummary && (
            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 1 }}>
                    Control Operations
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {controlSummary}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          )}
        </Grid>
      )}
      <Stack />
    </>
  );
}
