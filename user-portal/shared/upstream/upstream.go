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

package upstream

import "errors"

// ErrNotFound is the single upstream not-found sentinel. Only a 404 (or
// codes.NotFound) is ever classified into it.
var ErrNotFound = errors.New("upstream resource not found")

// ErrUnavailable is the single upstream-did-not-answer sentinel, and the only
// thing a handler answers 503 on.
var ErrUnavailable = errors.New("upstream did not answer")
