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

import { httpStatusOf } from './apiErrors';
import type { DatabasePlan, DatabaseServerDetail, DatabaseStatus } from '../types/databases';

/** The provider's name rule: a lowercase DNS label. */
export const DATABASE_NAME_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/** Hours in the month the provider quotes its prices per. */
const HOURS_PER_MONTH = 730;

/** The validation message for a database name, or '' when it is acceptable. */
export function databaseNameError(name: string, takenNames: readonly string[], maxLength?: number): string {
  if (name === '') return '';
  if (!DATABASE_NAME_REGEX.test(name)) return 'Use lowercase letters, digits and hyphens, starting and ending with a letter or digit.';
  if (maxLength !== undefined && name.length > maxLength) return `Use at most ${maxLength} characters.`;
  if (takenNames.includes(name)) return 'A service with this name already exists.';
  return '';
}

/** Statuses the provider is still working through; pages poll faster while one shows. */
export const isTransitionalDatabaseStatus = (status: DatabaseStatus): boolean => status === 'CREATING' || status === 'DELETING';

/** Whether a listed database has a detail page worth opening. */
export const isDatabaseOpenable = (status: DatabaseStatus): boolean => status !== 'DELETED' && status !== 'DELETING';

/** What the Backups tab shows for a database. */
export type DatabaseBackupView = { kind: 'notOffered' } | { kind: 'off' } | { kind: 'enabling' } | { kind: 'on'; health: 'ok' | 'starting' | 'failing'; retentionDays?: number; lastBackupAt?: string };

// The provider's backupState values. Archiving and the first base backup take
// a few minutes after backups are turned on; until both land, nothing can be
// restored yet. Right after enabling, the policy is already stored while the
// observed state still reads NotScheduled for about a minute, so with backups
// on it counts as starting too.
const BACKUP_STARTING_STATES = ['ArchivingPending', 'FirstBackupPending', 'NotScheduled'];
const BACKUP_FAILING_STATES = ['ArchivingFailed', 'BackupFailed', 'BackupStoreError', 'NoPlaneStore'];

/**
 * Whether enabled backups are still starting; the detail page polls faster
 * while they are. NotScheduled alone means nothing: a database with backups
 * off reads it too.
 */
export const isBackupStarting = (service: Pick<DatabaseServerDetail, 'backup' | 'backupState'> | undefined): boolean => !!service?.backup?.enabled && BACKUP_STARTING_STATES.includes(service.backupState ?? '');

/**
 * The Backups tab's state. `planOffersBackups` is undefined while the offering
 * loads or when it names no such plan; the provider then has the final say when
 * enabling is tried. `enableRequested` covers the gap between an accepted
 * enable and the detail reflecting it.
 */
export function databaseBackupView(service: Pick<DatabaseServerDetail, 'backup' | 'backupState' | 'lastBackupAt'>, planOffersBackups: boolean | undefined, enableRequested: boolean): DatabaseBackupView {
  if (service.backup?.enabled) {
    const health = BACKUP_FAILING_STATES.includes(service.backupState ?? '') ? 'failing' : isBackupStarting(service) ? 'starting' : 'ok';
    return { kind: 'on', health, retentionDays: service.backup.retentionDays, lastBackupAt: service.lastBackupAt };
  }
  if (planOffersBackups === false) return { kind: 'notOffered' };
  return enableRequested ? { kind: 'enabling' } : { kind: 'off' };
}

/** "standard" → "Standard". */
export const planLabel = (planId: string): string => (planId ? planId.charAt(0).toUpperCase() + planId.slice(1) : planId);

/** The provider's memory quantity for people: "2Gi" → "2 GB", "512Mi" → "512 MB". Anything else is shown as given. */
export function memoryLabel(quantity: string): string {
  const match = /^(\d+(?:\.\d+)?)(Gi|Mi)$/.exec(quantity);
  return match ? `${match[1]} ${match[2] === 'Gi' ? 'GB' : 'MB'}` : quantity;
}

/** The provider's CPU quantity for people: "2" → "2 vCPU", "500m" → "0.5 vCPU". */
export function cpuLabel(quantity: string): string {
  const milli = /^(\d+)m$/.exec(quantity);
  return `${milli ? Number(milli[1]) / 1000 : quantity} vCPU`;
}

/**
 * One line summing up a plan's size, e.g. "1 vCPU · 2 GB RAM · 5 GB storage ·
 * daily backups". `storageGi` is the database's own size when known; the plan's
 * default otherwise, which is what every database is created with.
 */
export function planSpecLine(plan: Pick<DatabasePlan, 'cpu' | 'memory' | 'defaultStorageGi' | 'backups'>, storageGi?: number): string {
  const storage = storageGi ?? plan.defaultStorageGi;
  return [plan.cpu && cpuLabel(plan.cpu), plan.memory && `${memoryLabel(plan.memory)} RAM`, storage !== undefined && `${storage} GB storage`, plan.backups && 'daily backups'].filter(Boolean).join(' · ');
}

export function nodeDescription(count: number): string {
  return count > 1 ? `${count} nodes (high availability)` : '1 node (not highly available)';
}

/** Monthly and hourly list prices of a plan, or undefined when the provider publishes none. */
export function planPrice(plan: Pick<DatabasePlan, 'monthlyPrice' | 'currency'>): { monthly: string; hourly: string } | undefined {
  if (plan.monthlyPrice === undefined) return undefined;
  const currency = plan.currency || 'USD';
  const format = (value: number, digits: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  return { monthly: format(plan.monthlyPrice, 2), hourly: format(plan.monthlyPrice / HOURS_PER_MONTH, 4) };
}

/**
 * Turns a failed create into an alert. The BFF passes the provider's refusals
 * through with their own wording (a taken name, no room left, a plan that does
 * not fit), so those are shown as written.
 */
export function toCreateDatabaseError(error: unknown): { title: string; message: string } {
  const message = error instanceof Error ? error.message : '';
  switch (httpStatusOf(error)) {
    case 400:
    case 409:
    case 422:
      return { title: 'The database could not be created', message };
    case 403:
      return { title: 'Your subscription is suspended', message: 'Renew your subscription to create databases.' };
    case 503:
      return { title: 'Databases are unavailable right now', message: message || 'Try again shortly.' };
    default:
      return { title: 'Failed to create the database', message: message || 'Try again.' };
  }
}

/** The file name a downloaded CA certificate is saved as. */
export const caCertificateFileName = (databaseName: string): string => `${databaseName}-ca.pem`;
