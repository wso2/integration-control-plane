/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein is strictly forbidden, unless permitted by WSO2 in accordance with
 * the WSO2 Commercial License available at http://wso2.com/licenses.
 * For specific language governing the permissions and limitations under
 * this license, please see the license as well as any agreement you've
 * entered into with WSO2 governing the purchase of this software and any
 * associated services.
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
