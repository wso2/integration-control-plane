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

package env_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/wso2-enterprise/integration-user-portal-service/shared/infrastructure/env"
)

// The keys are prefixed so nothing the developer's shell exports can decide
// whether a case passes.
const (
	keyString   = "LOADER_TEST_STRING"
	keyInt      = "LOADER_TEST_INT"
	keyBool     = "LOADER_TEST_BOOL"
	keyDuration = "LOADER_TEST_DURATION"
	keyStrings  = "LOADER_TEST_STRINGS"
	keyUnset    = "LOADER_TEST_UNSET"
)

func TestLoaderReadsEachType(t *testing.T) {
	t.Setenv(keyString, "a value")
	t.Setenv(keyInt, "7")
	t.Setenv(keyBool, "false")
	t.Setenv(keyDuration, "90s")

	l := env.NewLoader(context.Background())

	assert.Equal(t, "a value", l.String(keyString))
	assert.Equal(t, 7, l.Int(keyInt))
	assert.False(t, l.Bool(keyBool))
	assert.Equal(t, 90*time.Second, l.Duration(keyDuration))
	assert.NoError(t, l.Err())
}

func TestLoaderReadsACommaSeparatedListInOrder(t *testing.T) {
	t.Setenv(keyStrings, "first, second ,third")

	l := env.NewLoader(context.Background())

	assert.Equal(t, []string{"first", "second", "third"}, l.Strings(keyStrings))
	assert.NoError(t, l.Err())
}

func TestLoaderReadsAOneEntryList(t *testing.T) {
	t.Setenv(keyStrings, "only,")

	l := env.NewLoader(context.Background())

	assert.Equal(t, []string{"only"}, l.Strings(keyStrings))
	assert.NoError(t, l.Err())
}

func TestLoaderRejectsAListThatNamesNothing(t *testing.T) {
	t.Setenv(keyStrings, " , ")

	l := env.NewLoader(context.Background())

	assert.Empty(t, l.Strings(keyStrings))
	require.Error(t, l.Err())
	assert.Contains(t, l.Err().Error(), keyStrings)
}

func TestLoaderFallsBackWhenUnset(t *testing.T) {
	l := env.NewLoader(context.Background())

	assert.Equal(t, "fallback", l.String(keyUnset, "fallback"))
	assert.Equal(t, 3, l.Int(keyUnset, 3))
	assert.True(t, l.Bool(keyUnset, true))
	assert.Equal(t, time.Hour, l.Duration(keyUnset, time.Hour))
	assert.Equal(t, []string{"one", "two"}, l.Strings(keyUnset, []string{"one", "two"}))
	assert.NoError(t, l.Err())
}

func TestLoaderRequiresAVariableWithNoFallback(t *testing.T) {
	l := env.NewLoader(context.Background())

	assert.Empty(t, l.String(keyUnset))
	require.Error(t, l.Err())
	assert.Contains(t, l.Err().Error(), keyUnset)

	l = env.NewLoader(context.Background())
	assert.Empty(t, l.Strings(keyUnset))
	require.Error(t, l.Err())
	assert.Contains(t, l.Err().Error(), keyUnset)
}

// The first failure is the one reported: it is the variable a per-read error
// check would have stopped on.
func TestLoaderKeepsTheFirstError(t *testing.T) {
	t.Setenv(keyInt, "not a number")
	t.Setenv(keyDuration, "not a duration")

	l := env.NewLoader(context.Background())

	l.Int(keyInt)
	l.Duration(keyDuration)

	require.Error(t, l.Err())
	assert.Contains(t, l.Err().Error(), keyInt)
	assert.NotContains(t, l.Err().Error(), keyDuration)
}

// A held error short-circuits every later read, so a variable that is set is not
// consulted and one that is required does not add a second failure.
func TestLoaderSkipsEveryReadAfterAFailure(t *testing.T) {
	t.Setenv(keyString, "a value")
	t.Setenv(keyInt, "7")
	t.Setenv(keyBool, "true")
	t.Setenv(keyDuration, "90s")
	t.Setenv(keyStrings, "one,two")

	l := env.NewLoader(context.Background())

	l.String(keyUnset)
	first := l.Err()
	require.Error(t, first)

	assert.Empty(t, l.String(keyString))
	assert.Zero(t, l.Int(keyInt))
	assert.False(t, l.Bool(keyBool))
	assert.Zero(t, l.Duration(keyDuration))
	assert.Empty(t, l.Strings(keyStrings))
	assert.Equal(t, first, l.Err())
}

func TestLoaderPrefersTheFileOverTheVariable(t *testing.T) {
	path := filepath.Join(t.TempDir(), "secret")
	require.NoError(t, os.WriteFile(path, []byte("from file\n"), 0o600))
	t.Setenv(keyString, "from env")
	t.Setenv(keyString+"_FILE", path)

	l := env.NewLoader(context.Background())

	assert.Equal(t, "from file", l.String(keyString))
	assert.NoError(t, l.Err())
}

func TestLoaderReadsEveryTypeFromAFile(t *testing.T) {
	dir := t.TempDir()
	for key, val := range map[string]string{keyInt: "7", keyBool: "true", keyDuration: "90s", keyStrings: "one,two"} {
		path := filepath.Join(dir, key)
		require.NoError(t, os.WriteFile(path, []byte(val), 0o600))
		t.Setenv(key+"_FILE", path)
	}

	l := env.NewLoader(context.Background())

	assert.Equal(t, 7, l.Int(keyInt))
	assert.True(t, l.Bool(keyBool))
	assert.Equal(t, 90*time.Second, l.Duration(keyDuration))
	assert.Equal(t, []string{"one", "two"}, l.Strings(keyStrings))
	assert.NoError(t, l.Err())
}

// A mounted secret not yet populated must not start the process with "".
func TestLoaderTreatsAnEmptyFileAsUnset(t *testing.T) {
	path := filepath.Join(t.TempDir(), "secret")
	require.NoError(t, os.WriteFile(path, []byte(" \n"), 0o600))
	t.Setenv(keyUnset+"_FILE", path)

	optional := env.NewLoader(context.Background())
	assert.Equal(t, "fallback", optional.String(keyUnset, "fallback"))
	assert.NoError(t, optional.Err())

	required := env.NewLoader(context.Background())
	assert.Empty(t, required.String(keyUnset))
	require.Error(t, required.Err())
	assert.Contains(t, required.Err().Error(), keyUnset)
}

func TestLoaderTreatsAnEmptyVariableAsUnset(t *testing.T) {
	t.Setenv(keyUnset, " ")

	optional := env.NewLoader(context.Background())
	assert.Equal(t, "fallback", optional.String(keyUnset, "fallback"))
	assert.NoError(t, optional.Err())

	required := env.NewLoader(context.Background())
	assert.Empty(t, required.String(keyUnset))
	require.Error(t, required.Err())
	assert.Contains(t, required.Err().Error(), keyUnset)
}

func TestLoaderFailsOnAnUnreadableFileRatherThanFallingBack(t *testing.T) {
	t.Setenv(keyUnset+"_FILE", filepath.Join(t.TempDir(), "missing"))

	l := env.NewLoader(context.Background())

	assert.Empty(t, l.String(keyUnset, "fallback"))
	require.Error(t, l.Err())
	assert.Contains(t, l.Err().Error(), keyUnset+"_FILE")
}
