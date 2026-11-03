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

package common

import "github.com/google/uuid"

// UniqueIdentifier is the identifier type used across the service. It is an
// alias so the underlying implementation can be swapped in one place without
// touching call sites.
type ID = uuid.UUID

var NilID = uuid.Nil

func NewID() ID {
	return uuid.New()
}

func ParseID(s string) (ID, error) {
	return uuid.Parse(s)
}

// MustParseID parses a literal ID and panics if it is malformed.
func MustParseID(s string) ID {
	return uuid.MustParse(s)
}
