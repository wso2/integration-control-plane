/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

package org.wso2.ei.dashboard.core.commons.utils;

import com.google.gson.JsonParser;
import org.junit.Assert;
import org.junit.Test;

public class TokenUtilsTest {

    @Test
    public void testMatchesAllowedGroupFromArrayClaim() {

        Assert.assertTrue(TokenUtils.isUserInAllowedGroup(
                JsonParser.parseString("[\"ICP-Admins\",\"Other\"]"), "ICP-Admins,ICP-Viewers"));
    }

    @Test
    public void testMatchesAllowedGroupFromPrimitiveClaimAndJsonConfiguration() {

        Assert.assertTrue(TokenUtils.isUserInAllowedGroup(
                JsonParser.parseString("\"ICP-Viewers\""), "[\"ICP-Admins\",\"ICP-Viewers\"]"));
    }

    @Test
    public void testDoesNotUsePartialGroupMatches() {

        Assert.assertFalse(TokenUtils.isUserInAllowedGroup(
                JsonParser.parseString("\"Admin\""), "SuperAdmin"));
    }

    @Test
    public void testMissingClaimIsDeniedWhenGroupsAreConfigured() {

        Assert.assertFalse(TokenUtils.isUserInAllowedGroup(null, "ICP-Admins"));
    }

    @Test
    public void testDetectsEmptyAndDelimitedConfiguration() {

        Assert.assertFalse(TokenUtils.hasConfiguredGroups(""));
        Assert.assertTrue(TokenUtils.hasConfiguredGroups("ICP-Admins;ICP-Viewers"));
    }
}
