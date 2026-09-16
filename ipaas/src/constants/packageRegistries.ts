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

import type { PackageRegistryCatalogEntry } from '../types/packageRegistries';

export const BALLERINA_CENTRAL_ID = 'ballerina-central';

export const BALLERINA_CENTRAL_TOKEN_PATH = '/ballerina-central/token';

export const BALLERINA_CENTRAL_TOKEN_EXPIRY_WARNING_DAYS = 90;

export const BALLERINA_CENTRAL_TOKEN_INSTRUCTIONS = {
  heading: 'How to generate a token',
  steps: ['Log in to your account on Ballerina Central.', 'Navigate to the Tokens menu in the left navigation bar.', 'Press the + Generate New Token button.', 'Copy the token and paste it below.'],
  linkLabel: 'Open Ballerina Central',
  linkUrl: 'https://central.ballerina.io',
};

export const BALLERINA_CENTRAL_TOKEN_PANEL_COPY = {
  heading: 'Configure Ballerina Central access',
  optionalTag: 'Optional',
  infoMessage: "Once configured, this token is applied automatically to all future builds in this organization, so you won't need to set it up again. You can update it anytime from Settings > Package Registries in your organization's home view.",
  accessTokenLabel: 'Access token',
  tokenPlaceholder: 'Paste your token here',
  saveLabel: 'Save token',
  saveSuccessMessage: 'Token saved successfully.',
};

export const PACKAGE_REGISTRIES: PackageRegistryCatalogEntry[] = [
  {
    id: BALLERINA_CENTRAL_ID,
    name: 'Ballerina Central',
    description: 'Pull private packages from your Ballerina Central organization.',
    iconType: 'ballerina',
  },
];
