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

export interface CertificateValidity {
  label: string;
  color: 'success' | 'warning' | 'error' | 'default';
  category: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'UNKNOWN';
}

const EXPIRING_SOON_DAYS = 30;

export function certificateValidity(notAfter?: string): CertificateValidity {
  if (!notAfter) return { label: 'N/A', color: 'default', category: 'UNKNOWN' };
  const expiresAt = new Date(notAfter).getTime();
  if (Number.isNaN(expiresAt)) return { label: 'N/A', color: 'default', category: 'UNKNOWN' };
  const days = Math.floor((expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: 'Expired', color: 'error', category: 'EXPIRED' };
  if (days === 0) return { label: 'Expires today', color: 'error', category: 'EXPIRED' };
  if (days <= EXPIRING_SOON_DAYS) return { label: `Expires in ${days} ${days === 1 ? 'day' : 'days'}`, color: 'warning', category: 'EXPIRING_SOON' };
  return { label: `Expires in ${days} days`, color: 'success', category: 'VALID' };
}

export function certificateTypeLabel(certificateType?: string): string {
  switch (certificateType) {
    case 'TLS':
      return 'Public Cert';
    case 'CustomDomain':
      return 'Custom Domain';
    default:
      return certificateType || 'N/A';
  }
}

/** Certificate expiry dates arrive as Java date strings (e.g. "Thu Jul 03 10:56:45 GMT 2036"). */
export function formatCertificateDate(dateString?: string): string | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}
