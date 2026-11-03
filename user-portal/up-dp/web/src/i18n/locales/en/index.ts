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

import agent from './agent.json';
import automation from './automation.json';
import common from './common.json';
import errors from './errors.json';
import format from './format.json';
import integrations from './integrations.json';
import overview from './overview.json';
import shell from './shell.json';
import workflow from './workflow.json';

/** One file per area of the SPA; each is the top-level key its strings are read under, as in `t('workflow.…')`. */
const en = { agent, automation, common, errors, format, integrations, overview, shell, workflow };

export default en;
