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

/**
 * A person's WSO2 Cloud marketing consent, as Pardot holds it. One decision covers every WSO2 Cloud
 * product, so an answer given in another console reads back here too.
 */
export type ConsentStatus = 'No Opt-in' | 'Unconfirmed' | ConsentDecision;

/** The two answers a person can record. `No Opt-in` and `Unconfirmed` mean they have not answered. */
export type ConsentDecision = 'Confirmed' | 'Unsubscribed';

export interface MarketingConsent {
  /** A blanket opt-out of all WSO2 email, separate from the consent status. */
  optoutOfEmails: boolean;
  consentStatus: ConsentStatus;
}
